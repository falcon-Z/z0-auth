/**
 * Base OAuth Provider
 * Implements the standard OAuth 2.0 authorization code flow
 */

import { OAuthConfig, OAuthTokenResponse, OAuthUserInfo } from "./types";
import { Logger } from "../error-handling";

export abstract class BaseOAuthProvider {
  protected config: OAuthConfig;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthorizationUrl(state: string, extraParams?: Record<string, string>): string {
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
        Logger.error("OAuth token exchange failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Token exchange failed: ${response.status}`);
      }

      const tokenData = await response.json();
      return tokenData as OAuthTokenResponse;
    } catch (error: any) {
      Logger.error("Error exchanging OAuth code for token", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Fetch user info from provider
   * Must be implemented by each provider
   */
  abstract getUserInfo(accessToken: string): Promise<OAuthUserInfo>;

  /**
   * Refresh access token (if supported)
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
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
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("OAuth token refresh failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const tokenData = await response.json();
      return tokenData as OAuthTokenResponse;
    } catch (error: any) {
      Logger.error("Error refreshing OAuth token", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke access token (if supported)
   */
  async revokeToken(token: string): Promise<void> {
    // Override in provider if revocation is supported
    Logger.warn("Token revocation not implemented for this provider");
  }

  /**
   * Validate provider configuration
   */
  validateConfig(): boolean {
    const required = [
      "clientId",
      "clientSecret",
      "redirectUri",
      "authorizationUrl",
      "tokenUrl",
      "userInfoUrl",
    ];

    for (const field of required) {
      if (!this.config[field as keyof OAuthConfig]) {
        Logger.error(`OAuth config missing required field: ${field}`);
        return false;
      }
    }

    return true;
  }
}
