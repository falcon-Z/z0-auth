/**
 * Organization External Provider Configuration API
 * Org admin endpoints for configuring OAuth/SAML/LDAP providers
 */

import { Hono } from "hono";
import { prisma } from "../../../utils/prisma";
import { authMiddleware } from "../../../middleware/auth";
import { requireOrgAccess } from "../../../middleware/require-scope";
import { ErrorResponseBuilder } from "../../../utils/error-handling";
import { AuditLogger } from "../../../utils/audit-logger";
import { z } from "zod";

const externalProviders = new Hono();

// Validation schema
const createProviderSchema = z.object({
  provider: z.enum([
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
  ]),
  providerType: z.enum(["OAUTH2", "SAML", "OIDC", "LDAP", "CUSTOM"]),
  isEnabled: z.boolean().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  autoProvision: z.boolean().optional(),
  defaultRole: z.string().optional(),
  mappings: z.record(z.any()).optional(),
  restrictions: z.record(z.any()).optional(),
});

const updateProviderSchema = createProviderSchema.partial();

/**
 * GET /api/v1/orgs/:orgId/external-providers
 * List external providers for organization
 */
externalProviders.get(
  "/:orgId/external-providers",
  authMiddleware,
  requireOrgAccess(),
  async (c) => {
    try {
      const orgId = c.req.param("orgId");

      const providers = await prisma.organizationExternalProvider.findMany({
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
          // Don't expose secrets
          clientId: true,
        },
      });

      return c.json({ providers });
    } catch (error: any) {
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to fetch external providers",
          "FETCH_FAILED",
          { error: error.message }
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
  authMiddleware,
  requireOrgAccess(),
  async (c) => {
    try {
      const orgId = c.req.param("orgId");
      const providerId = c.req.param("id");

      const provider = await prisma.organizationExternalProvider.findFirst({
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
          createdAt: true,
          updatedAt: true,
          createdBy: true,
          // clientSecret not exposed
        },
      });

      if (!provider) {
        return c.json(
          ErrorResponseBuilder.notFound("External provider not found"),
          404
        );
      }

      return c.json({ provider });
    } catch (error: any) {
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to fetch external provider",
          "FETCH_FAILED",
          { error: error.message }
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
  authMiddleware,
  requireOrgAccess(),
  async (c) => {
    try {
      const user = c.get("user");
      const orgId = c.req.param("orgId");
      const body = await c.req.json();

      const parsed = createProviderSchema.safeParse(body);
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

      const data = parsed.data;

      // Check if provider already exists
      const existing = await prisma.organizationExternalProvider.findFirst({
        where: {
          organizationId: orgId,
          provider: data.provider,
        },
      });

      if (existing) {
        return c.json(
          ErrorResponseBuilder.validation(
            "Provider already configured for this organization",
            [
              {
                field: "provider",
                message: "This provider is already configured. Use PATCH to update.",
              },
            ]
          ),
          409
        );
      }

      // Validate default role exists if specified
      if (data.defaultRole) {
        const role = await prisma.role.findFirst({
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

      // Create provider configuration
      const provider = await prisma.organizationExternalProvider.create({
        data: {
          organizationId: orgId,
          provider: data.provider,
          providerType: data.providerType,
          isEnabled: data.isEnabled ?? true,
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          redirectUri: data.redirectUri,
          scopes: data.scopes || [],
          mappings: data.mappings,
          restrictions: data.restrictions,
          autoProvision: data.autoProvision ?? false,
          defaultRole: data.defaultRole,
          createdBy: user.userId,
        },
      });

      // Log audit
      await AuditLogger.logOrganizationManagement(
        "SETTINGS_CHANGED",
        user.userId,
        orgId,
        {
          metadata: {
            action: "external_provider_created",
            provider: data.provider,
          },
        }
      );

      return c.json({ provider, message: "External provider configured" }, 201);
    } catch (error: any) {
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to create external provider",
          "CREATE_FAILED",
          { error: error.message }
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
  authMiddleware,
  requireOrgAccess(),
  async (c) => {
    try {
      const user = c.get("user");
      const orgId = c.req.param("orgId");
      const providerId = c.req.param("id");
      const body = await c.req.json();

      const parsed = updateProviderSchema.safeParse(body);
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

      const data = parsed.data;

      // Verify provider exists
      const existing = await prisma.organizationExternalProvider.findFirst({
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

      // Validate default role if specified
      if (data.defaultRole) {
        const role = await prisma.role.findFirst({
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

      // Update provider
      const provider = await prisma.organizationExternalProvider.update({
        where: { id: providerId },
        data: {
          isEnabled: data.isEnabled,
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          redirectUri: data.redirectUri,
          scopes: data.scopes,
          mappings: data.mappings,
          restrictions: data.restrictions,
          autoProvision: data.autoProvision,
          defaultRole: data.defaultRole,
        },
      });

      // Log audit
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

      return c.json({ provider, message: "External provider updated" });
    } catch (error: any) {
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to update external provider",
          "UPDATE_FAILED",
          { error: error.message }
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
  authMiddleware,
  requireOrgAccess(),
  async (c) => {
    try {
      const user = c.get("user");
      const orgId = c.req.param("orgId");
      const providerId = c.req.param("id");

      // Verify provider exists
      const existing = await prisma.organizationExternalProvider.findFirst({
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

      // Check if any users in this organization are using this provider
      const identityCount = await prisma.externalIdentity.count({
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
          ErrorResponseBuilder.validation(
            "Cannot delete provider with active users",
            [
              {
                field: "provider",
                message: `${identityCount} users are using this provider. Please migrate users before deleting.`,
              },
            ]
          ),
          409
        );
      }

      // Delete provider
      await prisma.organizationExternalProvider.delete({
        where: { id: providerId },
      });

      // Log audit
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

      return c.json({ message: "External provider deleted successfully" });
    } catch (error: any) {
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to delete external provider",
          "DELETE_FAILED",
          { error: error.message }
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
  authMiddleware,
  requireOrgAccess(),
  async (c) => {
    try {
      const user = c.get("user");
      const orgId = c.req.param("orgId");
      const providerId = c.req.param("id");

      // Verify provider exists
      const existing = await prisma.organizationExternalProvider.findFirst({
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

      // Toggle enabled status
      const provider = await prisma.organizationExternalProvider.update({
        where: { id: providerId },
        data: {
          isEnabled: !existing.isEnabled,
        },
      });

      // Log audit
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

      return c.json({
        provider,
        message: `External provider ${provider.isEnabled ? "enabled" : "disabled"}`,
      });
    } catch (error: any) {
      return c.json(
        ErrorResponseBuilder.system(
          "Failed to toggle external provider",
          "TOGGLE_FAILED",
          { error: error.message }
        ),
        500
      );
    }
  }
);

export default externalProviders;
