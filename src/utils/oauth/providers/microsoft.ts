/**
 * Microsoft/Azure AD OAuth Provider
 * Implements Microsoft OAuth 2.0 authentication
 */

import { BaseOAuthProvider } from "../base-provider";
import { OAuthConfig, OAuthUserInfo } from "../types";
import { Logger } from "../../error-handling";

export class MicrosoftOAuthProvider extends BaseOAuthProvider {
  private tenant: string;

  constructor(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    tenant: string = "common"
  ) {
    const config: OAuthConfig = {
      clientId,
      clientSecret,
      redirectUri,
      scopes: ["openid", "profile", "email", "User.Read"],
      authorizationUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    };

    super(config);
    this.tenant = tenant;
  }

  /**
   * Get authorization URL with Microsoft-specific parameters
   */
  getAuthorizationUrl(state: string): string {
    return super.getAuthorizationUrl(state, {
      response_mode: "query",
    });
  }

  /**
   * Fetch user info from Microsoft Graph
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
        Logger.error("Microsoft Graph user request failed", {
          status: response.status,
          error: errorText,
        });
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const data = await response.json();

      return {
        id: data.id,
        email: data.mail || data.userPrincipalName,
        emailVerified: true, // Azure AD emails are always verified
        name: data.displayName,
        firstName: data.givenName,
        lastName: data.surname,
        username: data.userPrincipalName,
        raw: data,
      };
    } catch (error: any) {
      Logger.error("Error fetching Microsoft user info", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get user's profile photo from Microsoft Graph
   */
  async getUserPhoto(accessToken: string): Promise<string | undefined> {
    try {
      const response = await fetch(
        "https://graph.microsoft.com/v1.0/me/photo/$value",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        // Convert to base64 data URL
        const buffer = await blob.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ""
          )
        );
        return `data:${blob.type};base64,${base64}`;
      }

      return undefined;
    } catch (error: any) {
      Logger.warn("Could not fetch Microsoft user photo", {
        error: error.message,
      });
      return undefined;
    }
  }
}
