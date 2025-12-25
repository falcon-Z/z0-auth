/**
 * Facebook OAuth Provider
 * Implements Facebook OAuth 2.0 authentication
 */

import { BaseOAuthProvider } from "../base-provider";
import { OAuthConfig, OAuthUserInfo } from "../types";
import { Logger } from "../../error-handling";

export class FacebookOAuthProvider extends BaseOAuthProvider {
  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    const config: OAuthConfig = {
      clientId,
      clientSecret,
      redirectUri,
      scopes: ["email", "public_profile"],
      authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
      userInfoUrl: "https://graph.facebook.com/v19.0/me",
    };

    super(config);
  }

  /**
   * Fetch user info from Facebook Graph API
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      // Request user profile with specified fields
      const fields = "id,name,email,picture.type(large)";
      const url = `${this.config.userInfoUrl}?fields=${fields}&access_token=${accessToken}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        Logger.error("Facebook user request failed", {
          status: response.status,
          error: errorData,
        });
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const userData = await response.json();

      return {
        id: userData.id,
        email: userData.email,
        emailVerified: true, // Facebook requires email verification
        name: userData.name,
        avatar: userData.picture?.data?.url,
        raw: userData,
      };
    } catch (error: any) {
      Logger.error("Error fetching Facebook user info", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke Facebook OAuth token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v19.0/me/permissions?access_token=${token}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        Logger.error("Facebook token revocation failed", {
          status: response.status,
          error: errorData,
        });
        throw new Error(`Token revocation failed: ${response.status}`);
      }
    } catch (error: any) {
      Logger.error("Error revoking Facebook token", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Debug access token to verify it's valid
   */
  async debugToken(accessToken: string): Promise<{ isValid: boolean; expiresAt?: Date; scopes?: string[] }> {
    try {
      // Facebook requires an app access token to debug user tokens
      const appAccessToken = `${this.config.clientId}|${this.config.clientSecret}`;
      const url = `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${appAccessToken}`;

      const response = await fetch(url);

      if (!response.ok) {
        return { isValid: false };
      }

      const data = await response.json();
      const tokenData = data.data;

      return {
        isValid: tokenData.is_valid,
        expiresAt: tokenData.expires_at ? new Date(tokenData.expires_at * 1000) : undefined,
        scopes: tokenData.scopes,
      };
    } catch (error: any) {
      Logger.error("Error debugging Facebook token", {
        error: error.message,
      });
      return { isValid: false };
    }
  }
}
