/**
 * Organization External Provider Configuration API
 * Org admin endpoints for configuring OAuth/SAML/LDAP providers
 */

import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import { verifyAccessTokenMiddleware, type TokenPayload } from "@z0/utils/auth";
import { requireOrgAccess, requireScope } from "../../../middleware/require-scope";
import {
  ErrorResponseBuilder,
  RequestContext,
  Logger,
} from "@z0/utils/error-handling";
import { AuditLogger } from "@z0/utils/audit-logger";
import { z } from "zod";
import { validator } from "hono/validator";

const externalProviders = new Hono();

const EXTERNAL_PROVIDERS = [
  "GOOGLE",
  "GITHUB",
  "MICROSOFT",
  "FACEBOOK",
  "LINKEDIN",
  "TWITTER",
  "DISCORD",
  "SLACK",
  "OKTA",
  "AUTH0",
  "KEYCLOAK",
  "AZURE_AD",
  "SAML_GENERIC",
  "LDAP_GENERIC",
  "CUSTOM_OAUTH2",
] as const;

const PROVIDER_TYPES = ["OAUTH2", "SAML", "OIDC", "LDAP", "CUSTOM"] as const;

const createProviderSchema = z.object({
  provider: z.enum(EXTERNAL_PROVIDERS),
  providerType: z.enum(PROVIDER_TYPES),
  isEnabled: z.boolean().optional().default(true),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().url().optional(),
  scopes: z.array(z.string()).optional().default([]),
  autoProvision: z.boolean().optional().default(false),
  defaultRole: z.string().optional(),
  mappings: z.record(z.any()).optional(),
  restrictions: z.record(z.any()).optional(),
  samlEntityId: z.string().optional(),
  samlSsoUrl: z.string().url().optional(),
  samlCertificate: z.string().optional(),
  ldapUrl: z.string().optional(),
  ldapBindDn: z.string().optional(),
  ldapBindPassword: z.string().optional(),
  ldapBaseDn: z.string().optional(),
});

const updateProviderSchema = createProviderSchema.partial();

/**
 * GET /api/v1/orgs/:orgId/external-providers
 * List external providers for organization
 */
externalProviders.get(
  "/:orgId/external-providers",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const requestId = RequestContext.generateRequestId();

    try {
      const orgId = c.req.param("orgId");

      const providers = await db.organizationExternalProvider.findMany({
        where: {
          organizationId: orgId,
        },
        select: {
          id: true,
          provider: true,
          providerType: true,
          isEnabled: true,
          redirectUri: true,
          scopes: true,
          autoProvision: true,
          defaultRole: true,
          createdAt: true,
          updatedAt: true,
          clientId: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return c.json({
        success: true,
        data: providers,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to fetch external providers", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to fetch external providers",
          "FETCH_FAILED"
        ),
        500
      );
    }
  }
);

/**
 * GET /api/v1/orgs/:orgId/external-providers/:id
 * Get specific external provider configuration
 */
externalProviders.get(
  "/:orgId/external-providers/:id",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const requestId = RequestContext.generateRequestId();

    try {
      const orgId = c.req.param("orgId");
      const providerId = c.req.param("id");

      const provider = await db.organizationExternalProvider.findFirst({
        where: {
          id: providerId,
          organizationId: orgId,
        },
        select: {
          id: true,
          provider: true,
          providerType: true,
          isEnabled: true,
          clientId: true,
          redirectUri: true,
          scopes: true,
          mappings: true,
          restrictions: true,
          autoProvision: true,
          defaultRole: true,
          samlEntityId: true,
          samlSsoUrl: true,
          ldapUrl: true,
          ldapBaseDn: true,
          ldapBindDn: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
        },
      });

      if (!provider) {
        return c.json(
          ErrorResponseBuilder.notFound("External provider not found"),
          404
        );
      }

      return c.json({
        success: true,
        data: provider,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to fetch external provider", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to fetch external provider",
          "FETCH_FAILED"
        ),
        500
      );
    }
  }
);

/**
 * POST /api/v1/orgs/:orgId/external-providers
 * Create/configure external provider for organization
 */
externalProviders.post(
  "/:orgId/external-providers",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:settings:write"),
  validator("json", (value, c) => {
    const parsed = createProviderSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid provider configuration",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
            code: i.code,
          }))
        ),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const user = c.get("user") as TokenPayload;
    const orgId = c.req.param("orgId");
    const data = c.req.valid("json");

    try {
      const existing = await db.organizationExternalProvider.findFirst({
        where: {
          organizationId: orgId,
          provider: data.provider,
        },
      });

      if (existing) {
        return c.json(
          ErrorResponseBuilder.conflict(
            "This provider is already configured. Use PATCH to update."
          ),
          409
        );
      }

      if (data.defaultRole) {
        const role = await db.role.findFirst({
          where: {
            organizationId: orgId,
            name: data.defaultRole,
          },
        });

        if (!role) {
          return c.json(
            ErrorResponseBuilder.validation("Invalid default role", [
              {
                field: "defaultRole",
                message: `Role '${data.defaultRole}' not found in organization`,
              },
            ]),
            400
          );
        }
      }

      const provider = await db.organizationExternalProvider.create({
        data: {
          organizationId: orgId,
          provider: data.provider,
          providerType: data.providerType,
          isEnabled: data.isEnabled,
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          redirectUri: data.redirectUri,
          scopes: data.scopes,
          mappings: data.mappings,
          restrictions: data.restrictions,
          autoProvision: data.autoProvision,
          defaultRole: data.defaultRole,
          samlEntityId: data.samlEntityId,
          samlSsoUrl: data.samlSsoUrl,
          samlCertificate: data.samlCertificate,
          ldapUrl: data.ldapUrl,
          ldapBindDn: data.ldapBindDn,
          ldapBindPassword: data.ldapBindPassword,
          ldapBaseDn: data.ldapBaseDn,
          createdBy: user.userId,
        },
        select: {
          id: true,
          provider: true,
          providerType: true,
          isEnabled: true,
          clientId: true,
          redirectUri: true,
          scopes: true,
          autoProvision: true,
          defaultRole: true,
          createdAt: true,
        },
      });

      await AuditLogger.logOrganizationManagement(
        "SETTINGS_CHANGED",
        user.userId,
        orgId,
        {
          metadata: {
            action: "external_provider_created",
            provider: data.provider,
            providerId: provider.id,
          },
        }
      );

      Logger.info("External provider created", {
        providerId: provider.id,
        orgId,
        provider: data.provider,
        createdBy: user.userId,
        requestId,
      });

      return c.json(
        {
          success: true,
          message: "External provider configured successfully",
          data: provider,
          requestId,
        },
        201
      );
    } catch (error: any) {
      Logger.error("Failed to create external provider", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to create external provider",
          "CREATE_FAILED"
        ),
        500
      );
    }
  }
);

/**
 * PATCH /api/v1/orgs/:orgId/external-providers/:id
 * Update external provider configuration
 */
externalProviders.patch(
  "/:orgId/external-providers/:id",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:settings:write"),
  validator("json", (value, c) => {
    const parsed = updateProviderSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid provider configuration",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
            code: i.code,
          }))
        ),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const user = c.get("user") as TokenPayload;
    const orgId = c.req.param("orgId");
    const providerId = c.req.param("id");
    const data = c.req.valid("json");

    try {
      const existing = await db.organizationExternalProvider.findFirst({
        where: {
          id: providerId,
          organizationId: orgId,
        },
      });

      if (!existing) {
        return c.json(
          ErrorResponseBuilder.notFound("External provider not found"),
          404
        );
      }

      if (data.defaultRole) {
        const role = await db.role.findFirst({
          where: {
            organizationId: orgId,
            name: data.defaultRole,
          },
        });

        if (!role) {
          return c.json(
            ErrorResponseBuilder.validation("Invalid default role", [
              {
                field: "defaultRole",
                message: `Role '${data.defaultRole}' not found in organization`,
              },
            ]),
            400
          );
        }
      }

      const provider = await db.organizationExternalProvider.update({
        where: { id: providerId },
        data: {
          ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
          ...(data.clientId !== undefined && { clientId: data.clientId }),
          ...(data.clientSecret !== undefined && { clientSecret: data.clientSecret }),
          ...(data.redirectUri !== undefined && { redirectUri: data.redirectUri }),
          ...(data.scopes !== undefined && { scopes: data.scopes }),
          ...(data.mappings !== undefined && { mappings: data.mappings }),
          ...(data.restrictions !== undefined && { restrictions: data.restrictions }),
          ...(data.autoProvision !== undefined && { autoProvision: data.autoProvision }),
          ...(data.defaultRole !== undefined && { defaultRole: data.defaultRole }),
          ...(data.samlEntityId !== undefined && { samlEntityId: data.samlEntityId }),
          ...(data.samlSsoUrl !== undefined && { samlSsoUrl: data.samlSsoUrl }),
          ...(data.samlCertificate !== undefined && { samlCertificate: data.samlCertificate }),
          ...(data.ldapUrl !== undefined && { ldapUrl: data.ldapUrl }),
          ...(data.ldapBindDn !== undefined && { ldapBindDn: data.ldapBindDn }),
          ...(data.ldapBindPassword !== undefined && { ldapBindPassword: data.ldapBindPassword }),
          ...(data.ldapBaseDn !== undefined && { ldapBaseDn: data.ldapBaseDn }),
        },
        select: {
          id: true,
          provider: true,
          providerType: true,
          isEnabled: true,
          clientId: true,
          redirectUri: true,
          scopes: true,
          autoProvision: true,
          defaultRole: true,
          updatedAt: true,
        },
      });

      await AuditLogger.logOrganizationManagement(
        "SETTINGS_CHANGED",
        user.userId,
        orgId,
        {
          metadata: {
            action: "external_provider_updated",
            provider: existing.provider,
            providerId,
          },
        }
      );

      Logger.info("External provider updated", {
        providerId,
        orgId,
        provider: existing.provider,
        updatedBy: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "External provider updated successfully",
        data: provider,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to update external provider", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to update external provider",
          "UPDATE_FAILED"
        ),
        500
      );
    }
  }
);

/**
 * DELETE /api/v1/orgs/:orgId/external-providers/:id
 * Delete external provider configuration
 */
externalProviders.delete(
  "/:orgId/external-providers/:id",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:settings:delete"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const user = c.get("user") as TokenPayload;
    const orgId = c.req.param("orgId");
    const providerId = c.req.param("id");

    try {
      const existing = await db.organizationExternalProvider.findFirst({
        where: {
          id: providerId,
          organizationId: orgId,
        },
      });

      if (!existing) {
        return c.json(
          ErrorResponseBuilder.notFound("External provider not found"),
          404
        );
      }

      const identityCount = await db.externalIdentity.count({
        where: {
          provider: existing.provider,
          user: {
            organizationMemberships: {
              some: {
                organizationId: orgId,
                isActive: true,
              },
            },
          },
        },
      });

      if (identityCount > 0) {
        return c.json(
          ErrorResponseBuilder.conflict(
            `Cannot delete provider with ${identityCount} active users. Please migrate users before deleting.`
          ),
          409
        );
      }

      await db.organizationExternalProvider.delete({
        where: { id: providerId },
      });

      await AuditLogger.logOrganizationManagement(
        "SETTINGS_CHANGED",
        user.userId,
        orgId,
        {
          metadata: {
            action: "external_provider_deleted",
            provider: existing.provider,
            providerId,
          },
        }
      );

      Logger.info("External provider deleted", {
        providerId,
        orgId,
        provider: existing.provider,
        deletedBy: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "External provider deleted successfully",
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to delete external provider", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to delete external provider",
          "DELETE_FAILED"
        ),
        500
      );
    }
  }
);

/**
 * PATCH /api/v1/orgs/:orgId/external-providers/:id/toggle
 * Enable/disable external provider
 */
externalProviders.patch(
  "/:orgId/external-providers/:id/toggle",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:settings:write"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const user = c.get("user") as TokenPayload;
    const orgId = c.req.param("orgId");
    const providerId = c.req.param("id");

    try {
      const existing = await db.organizationExternalProvider.findFirst({
        where: {
          id: providerId,
          organizationId: orgId,
        },
      });

      if (!existing) {
        return c.json(
          ErrorResponseBuilder.notFound("External provider not found"),
          404
        );
      }

      const provider = await db.organizationExternalProvider.update({
        where: { id: providerId },
        data: {
          isEnabled: !existing.isEnabled,
        },
        select: {
          id: true,
          provider: true,
          isEnabled: true,
          updatedAt: true,
        },
      });

      await AuditLogger.logOrganizationManagement(
        "SETTINGS_CHANGED",
        user.userId,
        orgId,
        {
          metadata: {
            action: "external_provider_toggled",
            provider: existing.provider,
            providerId,
            isEnabled: provider.isEnabled,
          },
        }
      );

      Logger.info("External provider toggled", {
        providerId,
        orgId,
        provider: existing.provider,
        isEnabled: provider.isEnabled,
        toggledBy: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: `External provider ${provider.isEnabled ? "enabled" : "disabled"}`,
        data: provider,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to toggle external provider", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to toggle external provider",
          "TOGGLE_FAILED"
        ),
        500
      );
    }
  }
);

/**
 * POST /api/v1/orgs/:orgId/external-providers/:id/test
 * Test external provider configuration
 */
externalProviders.post(
  "/:orgId/external-providers/:id/test",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:settings:write"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const providerId = c.req.param("id");

    try {
      const provider = await db.organizationExternalProvider.findFirst({
        where: {
          id: providerId,
          organizationId: orgId,
        },
      });

      if (!provider) {
        return c.json(
          ErrorResponseBuilder.notFound("External provider not found"),
          404
        );
      }

      const testResults: {
        success: boolean;
        checks: Array<{ name: string; passed: boolean; message: string }>;
      } = {
        success: true,
        checks: [],
      };

      if (provider.providerType === "OAUTH2" || provider.providerType === "OIDC") {
        if (!provider.clientId) {
          testResults.checks.push({
            name: "Client ID",
            passed: false,
            message: "Client ID is required for OAuth2/OIDC providers",
          });
          testResults.success = false;
        } else {
          testResults.checks.push({
            name: "Client ID",
            passed: true,
            message: "Client ID is configured",
          });
        }

        if (!provider.clientSecret) {
          testResults.checks.push({
            name: "Client Secret",
            passed: false,
            message: "Client Secret is required for OAuth2/OIDC providers",
          });
          testResults.success = false;
        } else {
          testResults.checks.push({
            name: "Client Secret",
            passed: true,
            message: "Client Secret is configured",
          });
        }

        if (!provider.redirectUri) {
          testResults.checks.push({
            name: "Redirect URI",
            passed: false,
            message: "Redirect URI is required",
          });
          testResults.success = false;
        } else {
          testResults.checks.push({
            name: "Redirect URI",
            passed: true,
            message: `Redirect URI: ${provider.redirectUri}`,
          });
        }
      }

      if (provider.providerType === "SAML") {
        if (!provider.samlEntityId) {
          testResults.checks.push({
            name: "Entity ID",
            passed: false,
            message: "SAML Entity ID is required",
          });
          testResults.success = false;
        } else {
          testResults.checks.push({
            name: "Entity ID",
            passed: true,
            message: "SAML Entity ID is configured",
          });
        }

        if (!provider.samlSsoUrl) {
          testResults.checks.push({
            name: "SSO URL",
            passed: false,
            message: "SAML SSO URL is required",
          });
          testResults.success = false;
        } else {
          testResults.checks.push({
            name: "SSO URL",
            passed: true,
            message: `SSO URL: ${provider.samlSsoUrl}`,
          });
        }

        if (!provider.samlCertificate) {
          testResults.checks.push({
            name: "Certificate",
            passed: false,
            message: "SAML Certificate is required",
          });
          testResults.success = false;
        } else {
          testResults.checks.push({
            name: "Certificate",
            passed: true,
            message: "SAML Certificate is configured",
          });
        }
      }

      if (provider.providerType === "LDAP") {
        if (!provider.ldapUrl) {
          testResults.checks.push({
            name: "LDAP URL",
            passed: false,
            message: "LDAP URL is required",
          });
          testResults.success = false;
        } else {
          testResults.checks.push({
            name: "LDAP URL",
            passed: true,
            message: `LDAP URL: ${provider.ldapUrl}`,
          });
        }

        if (!provider.ldapBaseDn) {
          testResults.checks.push({
            name: "Base DN",
            passed: false,
            message: "LDAP Base DN is required",
          });
          testResults.success = false;
        } else {
          testResults.checks.push({
            name: "Base DN",
            passed: true,
            message: "LDAP Base DN is configured",
          });
        }

        if (!provider.ldapBindDn || !provider.ldapBindPassword) {
          testResults.checks.push({
            name: "Bind Credentials",
            passed: false,
            message: "LDAP Bind DN and Password are required",
          });
          testResults.success = false;
        } else {
          testResults.checks.push({
            name: "Bind Credentials",
            passed: true,
            message: "LDAP Bind credentials are configured",
          });
        }
      }

      testResults.checks.push({
        name: "Provider Status",
        passed: provider.isEnabled,
        message: provider.isEnabled ? "Provider is enabled" : "Provider is disabled",
      });

      Logger.info("External provider test completed", {
        providerId,
        orgId,
        provider: provider.provider,
        success: testResults.success,
        requestId,
      });

      return c.json({
        success: true,
        data: {
          provider: provider.provider,
          providerType: provider.providerType,
          testResults,
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to test external provider", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to test external provider",
          "TEST_FAILED"
        ),
        500
      );
    }
  }
);

export default externalProviders;
