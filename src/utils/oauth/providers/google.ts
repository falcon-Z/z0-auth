/**
 * Google OAuth Provider
 * Implements Google OAuth 2.0 authentication
 */

import { BaseOAuthProvider } from "../base-provider";
import { OAuthConfig, OAuthUserInfo } from "../types";
import { Logger } from "../../error-handling";

export class GoogleOAuthProvider extends BaseOAuthProvider {
  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    const config: OAuthConfig = {
      clientId,
      clientSecret,
      redirectUri,
      scopes: ["openid", "email", "profile"],
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    };

    super(config);
  }

  /**
   * Get authorization URL with Google-specific parameters
   */
  getAuthorizationUrl(state: string): string {
    return super.getAuthorizationUrl(state, {
      access_type: "offline", // Request refresh token
      prompt: "consent", // Force consent screen for refresh token
    });
  }

  /**
   * Fetch user info from Google
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      const response = await fetch(this.config.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.error("Google userinfo request failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const data = await response.json();

      return {
        id: data.id,
        email: data.email,
        emailVerified: data.verified_email,
        name: data.name,
        firstName: data.given_name,
        lastName: data.family_name,
        avatar: data.picture,
        locale: data.locale,
        raw: data,
      };
    } catch (error: any) {
      Logger.error("Error fetching Google user info", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke Google OAuth token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/revoke?token=${token}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      if (!response.ok) {
        Logger.error("Google token revocation failed", {
          status: response.status,
        });
        throw new Error(`Token revocation failed: ${response.status}`);
      }
    } catch (error: any) {
      Logger.error("Error revoking Google token", {
        error: error.message,
      });
      throw error;
    }
  }
}
