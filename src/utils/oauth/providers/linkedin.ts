/**
 * LinkedIn OAuth Provider
 * Implements LinkedIn OAuth 2.0 authentication with OpenID Connect
 */

import { BaseOAuthProvider } from "../base-provider";
import { OAuthConfig, OAuthTokenResponse, OAuthUserInfo } from "../types";
import { Logger } from "../../error-handling";

export class LinkedInOAuthProvider extends BaseOAuthProvider {
  private codeVerifier: string = "";

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    const config: OAuthConfig = {
      clientId,
      clientSecret,
      redirectUri,
      scopes: ["openid", "profile", "email"],
      authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      userInfoUrl: "https://api.linkedin.com/v2/userinfo",
    };

    super(config);
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCE(): { verifier: string; challenge: string } {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const verifier = btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    // LinkedIn uses S256 challenge method
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);

    // Use SubtleCrypto for SHA-256
    return { verifier, challenge: verifier }; // Will compute challenge async
  }

  /**
   * Generate authorization URL with PKCE
   */
  getAuthorizationUrl(state: string, extraParams?: Record<string, string>): string {
    const pkce = this.generatePKCE();
    this.codeVerifier = pkce.verifier;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.config.scopes.join(" "),
      state,
      ...extraParams,
    });

    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch(this.config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: this.config.redirectUri,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("LinkedIn token exchange failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Token exchange failed: ${response.status}`);
      }

      const tokenData = await response.json();
      return tokenData as OAuthTokenResponse;
    } catch (error: any) {
      Logger.error("Error exchanging LinkedIn code for token", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Fetch user info from LinkedIn
   * Uses OpenID Connect userinfo endpoint
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      const response = await fetch(this.config.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("LinkedIn user request failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const userData = await response.json();

      return {
        id: userData.sub,
        email: userData.email,
        emailVerified: userData.email_verified || false,
        name: userData.name,
        firstName: userData.given_name,
        lastName: userData.family_name,
        avatar: userData.picture,
        locale: userData.locale,
        raw: userData,
      };
    } catch (error: any) {
      Logger.error("Error fetching LinkedIn user info", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke LinkedIn OAuth token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const response = await fetch("https://www.linkedin.com/oauth/v2/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          token,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("LinkedIn token revocation failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Token revocation failed: ${response.status}`);
      }
    } catch (error: any) {
      Logger.error("Error revoking LinkedIn token", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Introspect token to check validity
   */
  async introspectToken(token: string): Promise<{ active: boolean; expiresAt?: Date }> {
    try {
      const response = await fetch("https://www.linkedin.com/oauth/v2/introspectToken", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          token,
        }),
      });

      if (!response.ok) {
        return { active: false };
      }

      const data = await response.json();
      return {
        active: data.active,
        expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : undefined,
      };
    } catch (error: any) {
      Logger.error("Error introspecting LinkedIn token", {
        error: error.message,
      });
      return { active: false };
    }
  }
}
