/**
 * Slack OAuth Provider
 * Implements Slack OAuth 2.0 authentication
 */

import { BaseOAuthProvider } from "../base-provider";
import { OAuthConfig, OAuthUserInfo } from "../types";
import { Logger } from "../../error-handling";

export class SlackOAuthProvider extends BaseOAuthProvider {
  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    const config: OAuthConfig = {
      clientId,
      clientSecret,
      redirectUri,
      scopes: ["openid", "profile", "email"],
      authorizationUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      userInfoUrl: "https://slack.com/api/openid.connect.userInfo",
    };

    super(config);
  }

  /**
   * Fetch user info from Slack
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
        Logger.error("Slack user request failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const data = await response.json();

      return {
        id: data.sub,
        email: data.email,
        emailVerified: data.email_verified,
        name: data.name,
        firstName: data.given_name,
        lastName: data.family_name,
        avatar: data.picture,
        locale: data.locale,
        raw: data,
      };
    } catch (error: any) {
      Logger.error("Error fetching Slack user info", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke Slack OAuth token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const response = await fetch("https://slack.com/api/auth.revoke", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      if (!response.ok) {
        Logger.error("Slack token revocation failed", {
          status: response.status,
        });
        throw new Error(`Token revocation failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.ok) {
        throw new Error(`Slack revocation error: ${data.error}`);
      }
    } catch (error: any) {
      Logger.error("Error revoking Slack token", {
        error: error.message,
      });
      throw error;
    }
  }
}
