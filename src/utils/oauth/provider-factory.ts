/**
 * OAuth Provider Factory
 * Creates OAuth provider instances based on configuration
 */

import { BaseOAuthProvider } from "./base-provider";
import { OAuthProvider } from "./types";
import { GoogleOAuthProvider } from "./providers/google";
import { GitHubOAuthProvider } from "./providers/github";
import { MicrosoftOAuthProvider } from "./providers/microsoft";
import { DiscordOAuthProvider } from "./providers/discord";
import { SlackOAuthProvider } from "./providers/slack";
import { Logger } from "../error-handling";
import { prisma } from "../prisma";

export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tenant?: string; // For Microsoft/Azure AD
}

export class OAuthProviderFactory {
  /**
   * Create an OAuth provider instance
   */
  static createProvider(
    provider: OAuthProvider,
    config: ProviderConfig
  ): BaseOAuthProvider {
    const { clientId, clientSecret, redirectUri, tenant } = config;

    switch (provider) {
      case "GOOGLE":
        return new GoogleOAuthProvider(clientId, clientSecret, redirectUri);

      case "GITHUB":
        return new GitHubOAuthProvider(clientId, clientSecret, redirectUri);

      case "MICROSOFT":
        return new MicrosoftOAuthProvider(
          clientId,
          clientSecret,
          redirectUri,
          tenant || "common"
        );

      case "DISCORD":
        return new DiscordOAuthProvider(clientId, clientSecret, redirectUri);

      case "SLACK":
        return new SlackOAuthProvider(clientId, clientSecret, redirectUri);

      // Add more providers as needed
      case "FACEBOOK":
      case "LINKEDIN":
      case "TWITTER":
      case "OKTA":
      case "AUTH0":
      case "CUSTOM_OAUTH2":
        throw new Error(`Provider ${provider} not yet implemented`);

      default:
        throw new Error(`Unknown OAuth provider: ${provider}`);
    }
  }

  /**
   * Create provider from organization configuration
   */
  static async createProviderFromOrgConfig(
    organizationId: string,
    providerName: OAuthProvider
  ): Promise<BaseOAuthProvider> {
    try {
      // Fetch provider configuration from database
      const providerConfig = await prisma.organizationExternalProvider.findFirst({
        where: {
          organizationId,
          provider: providerName,
          isEnabled: true,
        },
      });

      if (!providerConfig) {
        throw new Error(
          `OAuth provider ${providerName} not configured for organization`
        );
      }

      if (!providerConfig.clientId || !providerConfig.clientSecret) {
        throw new Error(
          `OAuth provider ${providerName} missing required credentials`
        );
      }

      const redirectUri =
        providerConfig.redirectUri ||
        `${process.env.APP_URL}/api/auth/oauth/${providerName.toLowerCase()}/callback`;

      return this.createProvider(providerName, {
        clientId: providerConfig.clientId,
        clientSecret: providerConfig.clientSecret,
        redirectUri,
        // Add tenant for Azure AD
        tenant:
          providerName === "MICROSOFT"
            ? (providerConfig.mappings as any)?.tenant
            : undefined,
      });
    } catch (error: any) {
      Logger.error("Error creating OAuth provider from org config", {
        organizationId,
        provider: providerName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get supported providers
   */
  static getSupportedProviders(): OAuthProvider[] {
    return [
      "GOOGLE",
      "GITHUB",
      "MICROSOFT",
      "DISCORD",
      "SLACK",
      // Add more as implemented
    ];
  }

  /**
   * Check if provider is supported
   */
  static isProviderSupported(provider: string): boolean {
    return this.getSupportedProviders().includes(provider as OAuthProvider);
  }
}
