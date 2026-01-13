/**
 * GitHub OAuth Provider
 * Implements GitHub OAuth 2.0 authentication
 */

import { BaseOAuthProvider } from "../base-provider";
import { OAuthConfig, OAuthUserInfo } from "../types";
import { Logger } from "../../error-handling";

export class GitHubOAuthProvider extends BaseOAuthProvider {
  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    const config: OAuthConfig = {
      clientId,
      clientSecret,
      redirectUri,
      scopes: ["read:user", "user:email"],
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userInfoUrl: "https://api.github.com/user",
    };

    super(config);
  }

  /**
   * Fetch user info from GitHub
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      // Get user profile
      const userResponse = await fetch(this.config.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!userResponse.ok) {
        const errorText = await userResponse.text();
        Logger.error("GitHub user request failed", {
          status: userResponse.status,
          error: errorText,
        });
        throw new Error(`Failed to fetch user info: ${userResponse.status}`);
      }

      const userData = await userResponse.json();

      // Get user emails (primary email)
      const emailsResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      let primaryEmail = userData.email;
      let emailVerified = false;

      if (emailsResponse.ok) {
        const emails = await emailsResponse.json();
        const primary = emails.find((e: any) => e.primary);
        if (primary) {
          primaryEmail = primary.email;
          emailVerified = primary.verified;
        }
      }

      return {
        id: String(userData.id),
        email: primaryEmail,
        emailVerified,
        name: userData.name || userData.login,
        username: userData.login,
        avatar: userData.avatar_url,
        raw: userData,
      };
    } catch (error: any) {
      Logger.error("Error fetching GitHub user info", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke GitHub OAuth token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const response = await fetch(
        `https://api.github.com/applications/${this.config.clientId}/token`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/vnd.github.v3+json",
            Authorization: `Basic ${btoa(`${this.config.clientId}:${this.config.clientSecret}`)}`,
          },
          body: JSON.stringify({ access_token: token }),
        }
      );

      if (!response.ok && response.status !== 204) {
        Logger.error("GitHub token revocation failed", {
          status: response.status,
        });
        throw new Error(`Token revocation failed: ${response.status}`);
      }
    } catch (error: any) {
      Logger.error("Error revoking GitHub token", {
        error: error.message,
      });
      throw error;
    }
  }
}
