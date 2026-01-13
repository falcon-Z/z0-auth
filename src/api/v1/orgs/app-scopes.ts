/**
 * App Scopes Management API
 * Manage which scopes are available to an app
 */

import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import {
  verifyAccessTokenMiddleware,
  type TokenPayload,
} from "@z0/utils/auth";
import {
  ErrorResponseBuilder,
  RequestContext,
  Logger,
} from "@z0/utils/error-handling";
import { z } from "zod";
import { validator } from "hono/validator";
import { AuditLogger } from "@z0/utils/audit-logger";
import { requireOrgMembership, requireScope } from "@z0/utils/org-access";

const appScopes = new Hono();

// Apply auth middleware
appScopes.use("*", verifyAccessTokenMiddleware);

const assignScopeSchema = z.object({
  scopeId: z.string().min(1),
});

const bulkAssignScopesSchema = z.object({
  scopeIds: z.array(z.string().min(1)).min(1),
});

const assignUserScopeSchema = z.object({
  scopeId: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

/**
 * GET /:orgId/apps/:appId/scopes
 * List all scopes assigned to an app
 */
appScopes.get(
  "/:orgId/apps/:appId/scopes",
  requireOrgMembership(),
  requireScope("app:settings:read"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, appId } = c.req.param();

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      const appScopesList = await db.appScope.findMany({
        where: { appId },
        include: {
          scope: {
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              isSystem: true,
            },
          },
        },
        orderBy: { scope: { category: "asc" } },
      });

      // Group by category
      const byCategory: Record<string, any[]> = {};
      for (const appScope of appScopesList) {
        const category = appScope.scope.category;
        if (!byCategory[category]) {
          byCategory[category] = [];
        }
        byCategory[category].push({
          id: appScope.id,
          scopeId: appScope.scopeId,
          name: appScope.scope.name,
          description: appScope.scope.description,
          isSystem: appScope.scope.isSystem,
        });
      }

      return c.json({
        success: true,
        data: {
          scopes: appScopesList.map((as) => ({
            id: as.id,
            scopeId: as.scopeId,
            name: as.scope.name,
            description: as.scope.description,
            category: as.scope.category,
            isSystem: as.scope.isSystem,
          })),
          byCategory,
          total: appScopesList.length,
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to list app scopes", { error: error.message, appId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to list app scopes", "LIST_FAILED"),
        500
      );
    }
  }
);

/**
 * POST /:orgId/apps/:appId/scopes
 * Assign a scope to an app
 */
appScopes.post(
  "/:orgId/apps/:appId/scopes",
  requireOrgMembership(),
  requireScope("app:settings:write"),
  validator("json", (value, c) => {
    const parsed = assignScopeSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid request",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          }))
        ),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, appId } = c.req.param();
    const user = c.get("user") as TokenPayload;
    const { scopeId } = c.req.valid("json");

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      // Verify scope exists and belongs to org
      const scope = await db.scope.findFirst({
        where: { id: scopeId, organizationId: orgId },
      });

      if (!scope) {
        return c.json(ErrorResponseBuilder.notFound("Scope not found"), 404);
      }

      // Check if already assigned
      const existing = await db.appScope.findFirst({
        where: { appId, scopeId },
      });

      if (existing) {
        return c.json(
          ErrorResponseBuilder.conflict("Scope already assigned to this app"),
          409
        );
      }

      const appScope = await db.appScope.create({
        data: { appId, scopeId },
        include: {
          scope: {
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
            },
          },
        },
      });

      await AuditLogger.logOrganizationManagement(
        "APP_SCOPE_ASSIGNED",
        user.userId,
        orgId,
        {
          metadata: {
            appId,
            appName: app.name,
            scopeId,
            scopeName: scope.name,
          },
        }
      );

      Logger.info("Scope assigned to app", {
        appId,
        scopeId,
        scopeName: scope.name,
        orgId,
        userId: user.userId,
        requestId,
      });

      return c.json(
        {
          success: true,
          message: `Scope '${scope.name}' assigned to app`,
          data: {
            id: appScope.id,
            scopeId: appScope.scopeId,
            name: appScope.scope.name,
            description: appScope.scope.description,
            category: appScope.scope.category,
          },
          requestId,
        },
        201
      );
    } catch (error: any) {
      Logger.error("Failed to assign scope to app", { error: error.message, appId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to assign scope", "ASSIGN_FAILED"),
        500
      );
    }
  }
);

/**
 * PUT /:orgId/apps/:appId/scopes/bulk
 * Bulk assign/replace scopes for an app
 */
appScopes.put(
  "/:orgId/apps/:appId/scopes/bulk",
  requireOrgMembership(),
  requireScope("app:settings:write"),
  validator("json", (value, c) => {
    const parsed = bulkAssignScopesSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid request",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          }))
        ),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, appId } = c.req.param();
    const user = c.get("user") as TokenPayload;
    const { scopeIds } = c.req.valid("json");

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      // Verify all scopes exist and belong to org
      const scopes = await db.scope.findMany({
        where: {
          id: { in: scopeIds },
          organizationId: orgId,
        },
      });

      if (scopes.length !== scopeIds.length) {
        const foundIds = scopes.map((s) => s.id);
        const missing = scopeIds.filter((id) => !foundIds.includes(id));
        return c.json(
          ErrorResponseBuilder.validation("One or more scopes not found", [
            { field: "scopeIds", message: `Missing: ${missing.join(", ")}` },
          ]),
          404
        );
      }

      // Replace all app scopes
      await db.$transaction(async (tx) => {
        // Remove existing
        await tx.appScope.deleteMany({ where: { appId } });

        // Add new ones
        await tx.appScope.createMany({
          data: scopeIds.map((scopeId) => ({ appId, scopeId })),
        });
      });

      // Get updated list
      const appScopesList = await db.appScope.findMany({
        where: { appId },
        include: {
          scope: {
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
            },
          },
        },
      });

      await AuditLogger.logOrganizationManagement(
        "APP_SCOPES_BULK_UPDATED",
        user.userId,
        orgId,
        {
          metadata: {
            appId,
            appName: app.name,
            scopeCount: scopeIds.length,
            scopeNames: scopes.map((s) => s.name),
          },
        }
      );

      Logger.info("App scopes bulk updated", {
        appId,
        scopeCount: scopeIds.length,
        orgId,
        userId: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: `Updated app with ${scopeIds.length} scopes`,
        data: appScopesList.map((as) => ({
          id: as.id,
          scopeId: as.scopeId,
          name: as.scope.name,
          description: as.scope.description,
          category: as.scope.category,
        })),
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to bulk update app scopes", { error: error.message, appId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to update scopes", "BULK_UPDATE_FAILED"),
        500
      );
    }
  }
);

/**
 * DELETE /:orgId/apps/:appId/scopes/:scopeId
 * Remove a scope from an app
 */
appScopes.delete(
  "/:orgId/apps/:appId/scopes/:scopeId",
  requireOrgMembership(),
  requireScope("app:settings:delete"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, appId, scopeId } = c.req.param();
    const user = c.get("user") as TokenPayload;

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      // Check if scope is assigned to app
      const appScope = await db.appScope.findFirst({
        where: { appId, scopeId },
        include: { scope: true },
      });

      if (!appScope) {
        return c.json(
          ErrorResponseBuilder.notFound("Scope not assigned to this app"),
          404
        );
      }

      await db.appScope.delete({
        where: { id: appScope.id },
      });

      await AuditLogger.logOrganizationManagement(
        "APP_SCOPE_REMOVED",
        user.userId,
        orgId,
        {
          metadata: {
            appId,
            appName: app.name,
            scopeId,
            scopeName: appScope.scope.name,
          },
        }
      );

      Logger.info("Scope removed from app", {
        appId,
        scopeId,
        scopeName: appScope.scope.name,
        orgId,
        userId: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: `Scope '${appScope.scope.name}' removed from app`,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to remove scope from app", { error: error.message, appId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to remove scope", "REMOVE_FAILED"),
        500
      );
    }
  }
);

/**
 * GET /:orgId/apps/:appId/members/:userId/scopes
 * Get user-specific scopes for an app member
 */
appScopes.get(
  "/:orgId/apps/:appId/members/:userId/scopes",
  requireOrgMembership(),
  requireScope("app:members:read"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, appId, userId } = c.req.param();

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      // Verify user is a member of the app
      const membership = await db.appMembership.findFirst({
        where: { appId, userId, isActive: true },
      });

      if (!membership) {
        return c.json(ErrorResponseBuilder.notFound("User is not a member of this app"), 404);
      }

      // Get user-specific scopes for this app
      const userScopes = await db.userScope.findMany({
        where: {
          userId,
          appId,
        },
        include: {
          scope: {
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
            },
          },
        },
      });

      return c.json({
        success: true,
        data: userScopes.map((us) => ({
          id: us.id,
          scopeId: us.scopeId,
          name: us.scope.name,
          description: us.scope.description,
          category: us.scope.category,
          grantedAt: us.grantedAt,
          grantedBy: us.grantedBy,
          expiresAt: us.expiresAt,
        })),
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to get user app scopes", { error: error.message, appId, userId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to get user scopes", "GET_FAILED"),
        500
      );
    }
  }
);

/**
 * POST /:orgId/apps/:appId/members/:userId/scopes
 * Assign a scope to a user for a specific app
 */
appScopes.post(
  "/:orgId/apps/:appId/members/:userId/scopes",
  requireOrgMembership(),
  requireScope("app:members:write"),
  validator("json", (value, c) => {
    const parsed = assignUserScopeSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid request",
          parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          }))
        ),
        400
      );
    }
    return parsed.data;
  }),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, appId, userId } = c.req.param();
    const currentUser = c.get("user") as TokenPayload;
    const body = c.req.valid("json");

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      // Verify user is a member of the app
      const membership = await db.appMembership.findFirst({
        where: { appId, userId, isActive: true },
      });

      if (!membership) {
        return c.json(ErrorResponseBuilder.notFound("User is not a member of this app"), 404);
      }

      // Verify scope is assigned to the app
      const appScope = await db.appScope.findFirst({
        where: { appId, scopeId: body.scopeId },
        include: { scope: true },
      });

      if (!appScope) {
        return c.json(
          ErrorResponseBuilder.validation("Scope is not available for this app", [
            { field: "scopeId", message: "Scope must be assigned to the app first" },
          ]),
          400
        );
      }

      // Check if already assigned
      const existing = await db.userScope.findFirst({
        where: { userId, scopeId: body.scopeId, appId },
      });

      if (existing) {
        return c.json(
          ErrorResponseBuilder.conflict("User already has this scope for this app"),
          409
        );
      }

      const userScope = await db.userScope.create({
        data: {
          userId,
          scopeId: body.scopeId,
          appId,
          grantedBy: currentUser.userId,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
        include: { scope: true },
      });

      await AuditLogger.logOrganizationManagement(
        "USER_APP_SCOPE_ASSIGNED",
        currentUser.userId,
        orgId,
        {
          targetId: userId,
          metadata: {
            appId,
            appName: app.name,
            scopeId: body.scopeId,
            scopeName: appScope.scope.name,
            expiresAt: body.expiresAt,
          },
        }
      );

      Logger.info("User scope assigned for app", {
        userId,
        appId,
        scopeId: body.scopeId,
        scopeName: appScope.scope.name,
        grantedBy: currentUser.userId,
        requestId,
      });

      return c.json(
        {
          success: true,
          message: `Scope '${userScope.scope.name}' assigned to user`,
          data: {
            id: userScope.id,
            scopeId: userScope.scopeId,
            name: userScope.scope.name,
            description: userScope.scope.description,
            grantedAt: userScope.grantedAt,
            expiresAt: userScope.expiresAt,
          },
          requestId,
        },
        201
      );
    } catch (error: any) {
      Logger.error("Failed to assign scope to user", { error: error.message, userId, appId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to assign scope", "ASSIGN_FAILED"),
        500
      );
    }
  }
);

/**
 * DELETE /:orgId/apps/:appId/members/:userId/scopes/:scopeId
 * Remove a scope from a user for a specific app
 */
appScopes.delete(
  "/:orgId/apps/:appId/members/:userId/scopes/:scopeId",
  requireOrgMembership(),
  requireScope("app:members:write"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const { orgId, appId, userId, scopeId } = c.req.param();
    const currentUser = c.get("user") as TokenPayload;

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      // Find the user scope
      const userScope = await db.userScope.findFirst({
        where: { userId, scopeId, appId },
        include: { scope: true },
      });

      if (!userScope) {
        return c.json(
          ErrorResponseBuilder.notFound("User does not have this scope for this app"),
          404
        );
      }

      await db.userScope.delete({
        where: { id: userScope.id },
      });

      await AuditLogger.logOrganizationManagement(
        "USER_APP_SCOPE_REMOVED",
        currentUser.userId,
        orgId,
        {
          targetId: userId,
          metadata: {
            appId,
            appName: app.name,
            scopeId,
            scopeName: userScope.scope.name,
          },
        }
      );

      Logger.info("User scope removed for app", {
        userId,
        appId,
        scopeId,
        scopeName: userScope.scope.name,
        removedBy: currentUser.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: `Scope '${userScope.scope.name}' removed from user`,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to remove scope from user", { error: error.message, userId, appId, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to remove scope", "REMOVE_FAILED"),
        500
      );
    }
  }
);

export default appScopes;
