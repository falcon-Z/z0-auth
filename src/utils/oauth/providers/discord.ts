/**
 * Discord OAuth Provider
 * Implements Discord OAuth 2.0 authentication
 */

import { BaseOAuthProvider } from "../base-provider";
import { OAuthConfig, OAuthUserInfo } from "../types";
import { Logger } from "../../error-handling";

export class DiscordOAuthProvider extends BaseOAuthProvider {
  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    const config: OAuthConfig = {
      clientId,
      clientSecret,
      redirectUri,
      scopes: ["identify", "email"],
      authorizationUrl: "https://discord.com/api/oauth2/authorize",
      tokenUrl: "https://discord.com/api/oauth2/token",
      userInfoUrl: "https://discord.com/api/users/@me",
    };

    super(config);
  }

  /**
   * Fetch user info from Discord
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
        Logger.error("Discord user request failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const data = await response.json();

      // Discord avatar URL format
      const avatar = data.avatar
        ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
        : undefined;

      return {
        id: data.id,
        email: data.email,
        emailVerified: data.verified,
        name: data.global_name || data.username,
        username: data.username,
        avatar,
        locale: data.locale,
        raw: data,
      };
    } catch (error: any) {
      Logger.error("Error fetching Discord user info", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke Discord OAuth token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const response = await fetch("https://discord.com/api/oauth2/token/revoke", {
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
        Logger.error("Discord token revocation failed", {
          status: response.status,
        });
        throw new Error(`Token revocation failed: ${response.status}`);
      }
    } catch (error: any) {
      Logger.error("Error revoking Discord token", {
        error: error.message,
      });
      throw error;
    }
  }
}
