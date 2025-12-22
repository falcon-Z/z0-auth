/**
 * OAuth Service
 * Handles the complete OAuth authentication flow
 */

import { prisma } from "../prisma";
import { Logger } from "../error-handling";
import { OAuthProviderFactory } from "./provider-factory";
import { OAuthStateManager } from "./state-manager";
import { OAuthProvider, ExternalIdentityData } from "./types";
import { AuditLogger } from "../audit-logger";
import crypto from "crypto";

export interface OAuthAuthorizationResult {
  authorizationUrl: string;
  state: string;
}

export interface OAuthCallbackResult {
  user: any;
  externalIdentity: any;
  isNewUser: boolean;
  token?: string;
  refreshToken?: string;
}

export class OAuthService {
  /**
   * Initiate OAuth authorization flow
   */
  static async initiateAuthorization(
    provider: OAuthProvider,
    organizationId: string,
    returnUrl?: string
  ): Promise<OAuthAuthorizationResult> {
    try {
      // Verify organization exists
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        throw new Error("Organization not found");
      }

      // Verify provider is enabled for this organization
      const providerConfig = await prisma.organizationExternalProvider.findFirst({
        where: {
          organizationId,
          provider,
          isEnabled: true,
        },
      });

      if (!providerConfig) {
        throw new Error(
          `OAuth provider ${provider} not enabled for this organization`
        );
      }

      // Create OAuth provider instance
      const oauthProvider =
        await OAuthProviderFactory.createProviderFromOrgConfig(
          organizationId,
          provider
        );

      // Generate state for CSRF protection
      const state = OAuthStateManager.generateState(
        provider,
        organizationId,
        returnUrl
      );

      // Get authorization URL
      const authorizationUrl = oauthProvider.getAuthorizationUrl(state);

      Logger.info("OAuth authorization initiated", {
        provider,
        organizationId,
      });

      return {
        authorizationUrl,
        state,
      };
    } catch (error: any) {
      Logger.error("Error initiating OAuth authorization", {
        provider,
        organizationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle OAuth callback
   */
  static async handleCallback(
    code: string,
    state: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OAuthCallbackResult> {
    try {
      // Validate state
      const stateData = OAuthStateManager.validateState(state);
      if (!stateData) {
        throw new Error("Invalid or expired OAuth state");
      }

      const { provider, organizationId } = stateData;

      // Create OAuth provider instance
      const oauthProvider =
        await OAuthProviderFactory.createProviderFromOrgConfig(
          organizationId,
          provider
        );

      // Exchange code for token
      const tokenResponse = await oauthProvider.exchangeCodeForToken(code);

      // Fetch user info
      const userInfo = await oauthProvider.getUserInfo(
        tokenResponse.access_token
      );

      // Calculate token expiry
      const expiresAt = tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : undefined;

      // Create external identity data
      const identityData: ExternalIdentityData = {
        provider,
        providerId: userInfo.id,
        email: userInfo.email,
        username: userInfo.username,
        displayName: userInfo.name,
        avatarUrl: userInfo.avatar,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenType: tokenResponse.token_type,
        expiresAt,
        scopes: tokenResponse.scope?.split(" ") || [],
        profileData: userInfo.raw || {},
      };

      // Find or create user and external identity
      const result = await this.findOrCreateUser(
        organizationId,
        identityData,
        ipAddress,
        userAgent
      );

      Logger.info("OAuth callback handled successfully", {
        provider,
        organizationId,
        userId: result.user.id,
        isNewUser: result.isNewUser,
      });

      return result;
    } catch (error: any) {
      Logger.error("Error handling OAuth callback", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Find existing user or create new user with external identity
   */
  private static async findOrCreateUser(
    organizationId: string,
    identityData: ExternalIdentityData,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OAuthCallbackResult> {
    // Check if external identity already exists
    const existingIdentity = await prisma.externalIdentity.findUnique({
      where: {
        provider_providerId: {
          provider: identityData.provider,
          providerId: identityData.providerId,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingIdentity) {
      // Update existing identity with new token
      const updatedIdentity = await prisma.externalIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          accessToken: identityData.accessToken,
          refreshToken: identityData.refreshToken,
          tokenType: identityData.tokenType,
          expiresAt: identityData.expiresAt,
          scopes: identityData.scopes,
          profileData: identityData.profileData,
          lastUsedAt: new Date(),
        },
      });

      // Log event
      await prisma.externalIdentityEvent.create({
        data: {
          userId: existingIdentity.userId,
          identityId: existingIdentity.id,
          eventType: "LOGIN",
          ipAddress,
          userAgent,
          success: true,
        },
      });

      // Log audit
      await AuditLogger.logAuth(
        "LOGIN",
        { req: { header: () => ipAddress || "unknown" } } as any,
        existingIdentity.userId,
        identityData.email,
        {
          metadata: { provider: identityData.provider, method: "oauth" },
        }
      );

      return {
        user: existingIdentity.user,
        externalIdentity: updatedIdentity,
        isNewUser: false,
      };
    }

    // Check if user with this email exists in the organization
    const existingUser = await prisma.user.findFirst({
      where: {
        organizationId,
        email: identityData.email,
      },
    });

    if (existingUser) {
      // Link external identity to existing user
      const newIdentity = await prisma.externalIdentity.create({
        data: {
          userId: existingUser.id,
          provider: identityData.provider,
          providerId: identityData.providerId,
          providerType: "OAUTH2",
          email: identityData.email,
          username: identityData.username,
          displayName: identityData.displayName,
          avatarUrl: identityData.avatarUrl,
          accessToken: identityData.accessToken,
          refreshToken: identityData.refreshToken,
          tokenType: identityData.tokenType,
          expiresAt: identityData.expiresAt,
          scopes: identityData.scopes,
          profileData: identityData.profileData,
          isVerified: true,
          lastUsedAt: new Date(),
        },
      });

      // Log event
      await prisma.externalIdentityEvent.create({
        data: {
          userId: existingUser.id,
          identityId: newIdentity.id,
          eventType: "LINKED",
          ipAddress,
          userAgent,
          success: true,
        },
      });

      // Log audit
      await AuditLogger.logAuth(
        "LOGIN",
        { req: { header: () => ipAddress || "unknown" } } as any,
        existingUser.id,
        identityData.email,
        {
          metadata: {
            provider: identityData.provider,
            method: "oauth",
            identityLinked: true,
          },
        }
      );

      return {
        user: existingUser,
        externalIdentity: newIdentity,
        isNewUser: false,
      };
    }

    // Check auto-provisioning settings
    const providerConfig = await prisma.organizationExternalProvider.findFirst({
      where: {
        organizationId,
        provider: identityData.provider,
      },
    });

    if (!providerConfig?.autoProvision) {
      throw new Error(
        "User not found and auto-provisioning is disabled for this provider"
      );
    }

    // Get default role from provider config or use ORG_USER
    let roleId: string | undefined;
    if (providerConfig.defaultRole) {
      const role = await prisma.role.findFirst({
        where: {
          organizationId,
          name: providerConfig.defaultRole,
        },
      });
      roleId = role?.id;
    }

    // Auto-provision new user
    const newUser = await prisma.user.create({
      data: {
        organizationId,
        email: identityData.email,
        name: identityData.displayName || identityData.email,
        avatar: identityData.avatarUrl,
        emailVerified: true, // OAuth emails are verified
        status: "ACTIVE",
        roleId,
        password: crypto.randomBytes(32).toString("hex"), // Random password (won't be used)
      },
    });

    // Create external identity
    const newIdentity = await prisma.externalIdentity.create({
      data: {
        userId: newUser.id,
        provider: identityData.provider,
        providerId: identityData.providerId,
        providerType: "OAUTH2",
        email: identityData.email,
        username: identityData.username,
        displayName: identityData.displayName,
        avatarUrl: identityData.avatarUrl,
        accessToken: identityData.accessToken,
        refreshToken: identityData.refreshToken,
        tokenType: identityData.tokenType,
        expiresAt: identityData.expiresAt,
        scopes: identityData.scopes,
        profileData: identityData.profileData,
        isVerified: true,
        isPrimary: true,
        lastUsedAt: new Date(),
      },
    });

    // Log event
    await prisma.externalIdentityEvent.create({
      data: {
        userId: newUser.id,
        identityId: newIdentity.id,
        eventType: "CREATED",
        ipAddress,
        userAgent,
        success: true,
        metadata: { autoProvisioned: true },
      },
    });

    // Log audit
    await AuditLogger.log({
      action: "USER_CREATED",
      severity: "MEDIUM",
      targetId: newUser.id,
      targetType: "user",
      targetEmail: newUser.email,
      organizationId,
      actorType: "system",
      ipAddress,
      userAgent,
      status: "success",
      metadata: {
        provider: identityData.provider,
        autoProvisioned: true,
      },
    });

    return {
      user: newUser,
      externalIdentity: newIdentity,
      isNewUser: true,
    };
  }

  /**
   * Refresh OAuth token for an external identity
   */
  static async refreshToken(identityId: string): Promise<void> {
    try {
      const identity = await prisma.externalIdentity.findUnique({
        where: { id: identityId },
        include: {
          user: {
            include: {
              organization: true,
            },
          },
        },
      });

      if (!identity) {
        throw new Error("External identity not found");
      }

      if (!identity.refreshToken) {
        throw new Error("No refresh token available");
      }

      // Create OAuth provider instance
      const oauthProvider =
        await OAuthProviderFactory.createProviderFromOrgConfig(
          identity.user.organizationId,
          identity.provider as OAuthProvider
        );

      // Refresh token
      const tokenResponse = await oauthProvider.refreshAccessToken(
        identity.refreshToken
      );

      // Calculate token expiry
      const expiresAt = tokenResponse.expires_in
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : undefined;

      // Update identity
      await prisma.externalIdentity.update({
        where: { id: identityId },
        data: {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token || identity.refreshToken,
          tokenType: tokenResponse.token_type,
          expiresAt,
          scopes: tokenResponse.scope?.split(" ") || identity.scopes,
        },
      });

      // Log event
      await prisma.externalIdentityEvent.create({
        data: {
          userId: identity.userId,
          identityId: identity.id,
          eventType: "TOKEN_REFRESHED",
          success: true,
        },
      });

      Logger.info("OAuth token refreshed", {
        identityId,
        provider: identity.provider,
      });
    } catch (error: any) {
      Logger.error("Error refreshing OAuth token", {
        identityId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Revoke OAuth token and unlink identity
   */
  static async revokeIdentity(identityId: string): Promise<void> {
    try {
      const identity = await prisma.externalIdentity.findUnique({
        where: { id: identityId },
        include: {
          user: true,
        },
      });

      if (!identity) {
        throw new Error("External identity not found");
      }

      // Create OAuth provider instance
      const oauthProvider =
        await OAuthProviderFactory.createProviderFromOrgConfig(
          identity.user.organizationId,
          identity.provider as OAuthProvider
        );

      // Revoke token with provider
      if (identity.accessToken) {
        try {
          await oauthProvider.revokeToken(identity.accessToken);
        } catch (error: any) {
          Logger.warn("Failed to revoke token with provider", {
            error: error.message,
          });
        }
      }

      // Delete identity from database
      await prisma.externalIdentity.delete({
        where: { id: identityId },
      });

      // Log audit
      await AuditLogger.log({
        action: "PERMISSION_REVOKED",
        severity: "MEDIUM",
        actorId: identity.userId,
        targetId: identityId,
        targetType: "external_identity",
        organizationId: identity.user.organizationId,
        status: "success",
        metadata: { provider: identity.provider },
      });

      Logger.info("OAuth identity revoked", {
        identityId,
        provider: identity.provider,
      });
    } catch (error: any) {
      Logger.error("Error revoking OAuth identity", {
        identityId,
        error: error.message,
      });
      throw error;
    }
  }
}
