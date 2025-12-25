/**
 * Twitter OAuth Provider
 * Implements Twitter OAuth 2.0 with PKCE (X API v2)
 */

import { BaseOAuthProvider } from "../base-provider";
import { OAuthConfig, OAuthTokenResponse, OAuthUserInfo } from "../types";
import { Logger } from "../../error-handling";

export class TwitterOAuthProvider extends BaseOAuthProvider {
  private codeVerifier: string = "";

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    const config: OAuthConfig = {
      clientId,
      clientSecret,
      redirectUri,
      scopes: ["users.read", "tweet.read", "offline.access"],
      authorizationUrl: "https://twitter.com/i/oauth2/authorize",
      tokenUrl: "https://api.twitter.com/2/oauth2/token",
      userInfoUrl: "https://api.twitter.com/2/users/me",
    };

    super(config);
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private async generatePKCE(): Promise<{ verifier: string; challenge: string }> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const verifier = btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    // Generate S256 challenge
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    const challenge = btoa(String.fromCharCode(...hashArray))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    return { verifier, challenge };
  }

  /**
   * Generate authorization URL with PKCE (required by Twitter)
   */
  async getAuthorizationUrlAsync(state: string, extraParams?: Record<string, string>): Promise<string> {
    const pkce = await this.generatePKCE();
    this.codeVerifier = pkce.verifier;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.config.scopes.join(" "),
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
      ...extraParams,
    });

    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Synchronous version - stores verifier for later use
   */
  getAuthorizationUrl(state: string, extraParams?: Record<string, string>): string {
    // Generate verifier synchronously for basic flow
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const verifier = btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    this.codeVerifier = verifier;

    // For sync version, use plain challenge (not recommended, but works for basic flow)
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.config.scopes.join(" "),
      state,
      code_challenge: verifier,
      code_challenge_method: "plain",
      ...extraParams,
    });

    return `${this.config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Set code verifier (used when verifier is stored externally)
   */
  setCodeVerifier(verifier: string): void {
    this.codeVerifier = verifier;
  }

  /**
   * Get code verifier (for external storage)
   */
  getCodeVerifier(): string {
    return this.codeVerifier;
  }

  /**
   * Exchange authorization code for access token with PKCE
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    try {
      if (!this.codeVerifier) {
        throw new Error("Code verifier not set. Call getAuthorizationUrl first or setCodeVerifier.");
      }

      // Twitter requires Basic auth with client credentials
      const basicAuth = btoa(`${this.config.clientId}:${this.config.clientSecret}`);

      const response = await fetch(this.config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          redirect_uri: this.config.redirectUri,
          code_verifier: this.codeVerifier,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Twitter token exchange failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Token exchange failed: ${response.status}`);
      }

      const tokenData = await response.json();
      return tokenData as OAuthTokenResponse;
    } catch (error: any) {
      Logger.error("Error exchanging Twitter code for token", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Fetch user info from Twitter API v2
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      const fields = "id,name,username,profile_image_url,verified,created_at,description";
      const url = `${this.config.userInfoUrl}?user.fields=${fields}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Twitter user request failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const result = await response.json();
      const userData = result.data;

      return {
        id: userData.id,
        name: userData.name,
        username: userData.username,
        avatar: userData.profile_image_url?.replace("_normal", "_400x400"), // Get larger image
        verified: userData.verified,
        // Twitter doesn't provide email through basic scopes
        // Would need additional Twitter developer account verification
        raw: userData,
      };
    } catch (error: any) {
      Logger.error("Error fetching Twitter user info", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    try {
      const basicAuth = btoa(`${this.config.clientId}:${this.config.clientSecret}`);

      const response = await fetch(this.config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Twitter token refresh failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const tokenData = await response.json();
      return tokenData as OAuthTokenResponse;
    } catch (error: any) {
      Logger.error("Error refreshing Twitter token", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke Twitter OAuth token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const basicAuth = btoa(`${this.config.clientId}:${this.config.clientSecret}`);

      const response = await fetch("https://api.twitter.com/2/oauth2/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          token,
          token_type_hint: "access_token",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Twitter token revocation failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Token revocation failed: ${response.status}`);
      }
    } catch (error: any) {
      Logger.error("Error revoking Twitter token", {
        error: error.message,
      });
      throw error;
    }
  }
}
