/**
 * App Memberships API
 *
 * Manages app-level access through AppMembership model.
 * Users can be added to apps with roles: APP_OWNER, APP_MANAGER, APP_USER
 */

import { Hono } from "hono";
import { z } from "zod";
import { validator } from "hono/validator";
import { db } from "@z0/utils/db/client";
import {
  Logger,
  DatabaseErrorHandler,
  ErrorResponseBuilder,
  RequestContext,
} from "@z0/utils/error-handling";
import { verifyAccessTokenMiddleware, type TokenPayload } from "@z0/utils/auth";
import { requireOrgAccess, requireScope } from "../../../middleware/require-scope";
import { AuditLogger } from "@z0/utils/audit-logger";

const appMembers = new Hono();

/**
 * Schema for adding a user to an app
 */
const addAppMemberSchema = z.object({
  userId: z.string().cuid(),
  roleType: z.enum(["APP_OWNER", "APP_MANAGER", "APP_USER"]).default("APP_USER"),
  externalId: z.string().optional(), // App's identifier for this user
  metadata: z.record(z.any()).optional(), // App-specific user data
  customScopes: z.array(z.string()).optional(), // Custom scopes assigned by app manager
});

/**
 * Schema for updating app membership
 */
const updateAppMemberSchema = z.object({
  roleType: z.enum(["APP_OWNER", "APP_MANAGER", "APP_USER"]).optional(),
  externalId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  customScopes: z.array(z.string()).optional(),
});

/**
 * GET /api/v1/orgs/:orgId/apps/:appId/members
 * List app members
 */
appMembers.get(
  "/:orgId/apps/:appId/members",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const orgId = c.req.param("orgId");
    const appId = c.req.param("appId");
    const requestId = RequestContext.generateRequestId();

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      const memberships = await db.appMembership.findMany({
        where: {
          appId,
          isActive: true,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              avatar: true,
              status: true,
            },
          },
        },
        orderBy: { joinedAt: "desc" },
      });

      // Transform to cleaner response
      const members = memberships.map((m) => ({
        membershipId: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        avatar: m.user.avatar,
        roleType: m.roleType,
        externalId: m.externalId,
        customScopes: m.customScopes,
        status: m.user.status,
        joinedAt: m.joinedAt,
      }));

      return c.json({
        success: true,
        data: members,
        total: members.length,
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to list app members", { appId, orgId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to list app members", "DB_ERROR"),
        500
      );
    }
  }
);

/**
 * GET /api/v1/orgs/:orgId/apps/:appId/members/:userId
 * Get specific app member details
 */
appMembers.get(
  "/:orgId/apps/:appId/members/:userId",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const orgId = c.req.param("orgId");
    const appId = c.req.param("appId");
    const userId = c.req.param("userId");
    const requestId = RequestContext.generateRequestId();

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      const membership = await db.appMembership.findUnique({
        where: {
          userId_appId: { userId, appId },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              avatar: true,
              status: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
        },
      });

      if (!membership) {
        return c.json(
          ErrorResponseBuilder.notFound("User is not a member of this app"),
          404
        );
      }

      return c.json({
        success: true,
        data: {
          membershipId: membership.id,
          userId: membership.userId,
          ...membership.user,
          roleType: membership.roleType,
          externalId: membership.externalId,
          metadata: membership.metadata,
          customScopes: membership.customScopes,
          isActive: membership.isActive,
          joinedAt: membership.joinedAt,
          grantedBy: membership.grantedBy,
        },
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to fetch app member", { appId, userId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to fetch app member", "DB_ERROR"),
        500
      );
    }
  }
);

/**
 * POST /api/v1/orgs/:orgId/apps/:appId/members
 * Add a user to an app
 */
appMembers.post(
  "/:orgId/apps/:appId/members",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("app:users:manage"),
  validator("json", (value, c) => {
    const parsed = addAppMemberSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid data",
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
    const orgId = c.req.param("orgId");
    const appId = c.req.param("appId");
    const data = c.req.valid("json");
    const currentUser = c.get("user") as TokenPayload;
    const requestId = RequestContext.generateRequestId();

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      // Verify user exists and is a member of the organization
      const user = await db.user.findUnique({
        where: { id: data.userId },
        include: {
          organizationMemberships: {
            where: { organizationId: orgId, isActive: true },
          },
        },
      });

      if (!user) {
        return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
      }

      if (user.organizationMemberships.length === 0) {
        return c.json(
          ErrorResponseBuilder.validation(
            "User must be a member of the organization first",
            []
          ),
          400
        );
      }

      // Check if already a member
      const existingMembership = await db.appMembership.findUnique({
        where: {
          userId_appId: { userId: data.userId, appId },
        },
      });

      if (existingMembership) {
        if (existingMembership.isActive) {
          return c.json(
            ErrorResponseBuilder.conflict("User is already a member of this app"),
            409
          );
        }

        // Reactivate membership
        const reactivated = await db.appMembership.update({
          where: { id: existingMembership.id },
          data: {
            isActive: true,
            roleType: data.roleType,
            customScopes: data.customScopes || [],
            grantedBy: currentUser.userId,
            joinedAt: new Date(),
          },
        });

        Logger.info("App membership reactivated", {
          membershipId: reactivated.id,
          userId: data.userId,
          appId,
          orgId,
        });

        return c.json({
          success: true,
          message: "App membership reactivated",
          data: {
            membershipId: reactivated.id,
            userId: data.userId,
            email: user.email,
            roleType: reactivated.roleType,
          },
          requestId,
        });
      }

      // Create new membership
      const membership = await db.appMembership.create({
        data: {
          userId: data.userId,
          appId,
          roleType: data.roleType,
          externalId: data.externalId,
          metadata: data.metadata,
          customScopes: data.customScopes || [],
          isActive: true,
          grantedBy: currentUser.userId,
        },
      });

      // Audit log
      await AuditLogger.logOrganizationManagement(
        "APP_MEMBER_ADDED",
        currentUser.userId,
        orgId,
        {
          metadata: {
            appId,
            appName: app.name,
            targetUserId: data.userId,
            targetEmail: user.email,
            roleType: data.roleType,
            membershipId: membership.id,
          },
        }
      );

      Logger.info("App member added", {
        membershipId: membership.id,
        userId: data.userId,
        appId,
        orgId,
        roleType: data.roleType,
        addedBy: currentUser.userId,
        requestId,
      });

      return c.json(
        {
          success: true,
          message: "User added to app",
          data: {
            membershipId: membership.id,
            userId: data.userId,
            email: user.email,
            name: user.name,
            roleType: membership.roleType,
          },
          requestId,
        },
        201
      );
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Failed to add app member", {
        appId,
        userId: data.userId,
        error: dbError.message,
      });
      return c.json(
        ErrorResponseBuilder.database("Failed to add app member", dbError.code),
        500
      );
    }
  }
);

/**
 * PATCH /api/v1/orgs/:orgId/apps/:appId/members/:userId
 * Update app membership
 */
appMembers.patch(
  "/:orgId/apps/:appId/members/:userId",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("app:users:manage"),
  validator("json", (value, c) => {
    const parsed = updateAppMemberSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid data",
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
    const orgId = c.req.param("orgId");
    const appId = c.req.param("appId");
    const userId = c.req.param("userId");
    const data = c.req.valid("json");
    const currentUser = c.get("user") as TokenPayload;
    const requestId = RequestContext.generateRequestId();

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      const membership = await db.appMembership.findUnique({
        where: {
          userId_appId: { userId, appId },
        },
        include: { user: { select: { email: true } } },
      });

      if (!membership) {
        return c.json(
          ErrorResponseBuilder.notFound("User is not a member of this app"),
          404
        );
      }

      // Prevent demoting yourself from APP_OWNER if you're the only one
      if (
        data.roleType &&
        data.roleType !== "APP_OWNER" &&
        membership.roleType === "APP_OWNER" &&
        currentUser.userId === userId
      ) {
        const ownerCount = await db.appMembership.count({
          where: { appId, roleType: "APP_OWNER", isActive: true },
        });

        if (ownerCount <= 1) {
          return c.json(
            ErrorResponseBuilder.authorization(
              "Cannot demote yourself - you are the only App Owner"
            ),
            403
          );
        }
      }

      const oldRoleType = membership.roleType;

      const updated = await db.appMembership.update({
        where: { id: membership.id },
        data: {
          ...(data.roleType && { roleType: data.roleType }),
          ...(data.externalId !== undefined && { externalId: data.externalId }),
          ...(data.metadata !== undefined && { metadata: data.metadata }),
          ...(data.customScopes && { customScopes: data.customScopes }),
        },
      });

      // Audit log role changes
      if (data.roleType && data.roleType !== oldRoleType) {
        await AuditLogger.logOrganizationManagement(
          "APP_MEMBER_ROLE_CHANGED",
          currentUser.userId,
          orgId,
          {
            metadata: {
              appId,
              targetUserId: userId,
              targetEmail: membership.user.email,
              oldRoleType,
              newRoleType: data.roleType,
            },
          }
        );
      }

      Logger.info("App membership updated", {
        membershipId: membership.id,
        userId,
        appId,
        changes: data,
        updatedBy: currentUser.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "App membership updated",
        data: {
          membershipId: updated.id,
          userId,
          roleType: updated.roleType,
          customScopes: updated.customScopes,
        },
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to update app membership", { appId, userId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to update app membership", "DB_ERROR"),
        500
      );
    }
  }
);

/**
 * DELETE /api/v1/orgs/:orgId/apps/:appId/members/:userId
 * Remove user from app (deactivate membership)
 */
appMembers.delete(
  "/:orgId/apps/:appId/members/:userId",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("app:users:manage"),
  async (c) => {
    const orgId = c.req.param("orgId");
    const appId = c.req.param("appId");
    const userId = c.req.param("userId");
    const currentUser = c.get("user") as TokenPayload;
    const requestId = RequestContext.generateRequestId();

    // Prevent removing yourself
    if (currentUser.userId === userId) {
      return c.json(
        ErrorResponseBuilder.authorization("Cannot remove yourself from the app"),
        403
      );
    }

    try {
      // Verify app belongs to org
      const app = await db.app.findFirst({
        where: { id: appId, organizationId: orgId },
      });

      if (!app) {
        return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
      }

      const membership = await db.appMembership.findUnique({
        where: {
          userId_appId: { userId, appId },
        },
        include: { user: { select: { email: true } } },
      });

      if (!membership) {
        return c.json(
          ErrorResponseBuilder.notFound("User is not a member of this app"),
          404
        );
      }

      if (!membership.isActive) {
        return c.json(
          ErrorResponseBuilder.conflict("User is already removed from this app"),
          409
        );
      }

      // Prevent removing the last owner
      if (membership.roleType === "APP_OWNER") {
        const ownerCount = await db.appMembership.count({
          where: { appId, roleType: "APP_OWNER", isActive: true },
        });

        if (ownerCount <= 1) {
          return c.json(
            ErrorResponseBuilder.authorization(
              "Cannot remove the last owner of the app"
            ),
            403
          );
        }
      }

      // Soft delete (deactivate)
      await db.appMembership.update({
        where: { id: membership.id },
        data: { isActive: false },
      });

      // Audit log
      await AuditLogger.logOrganizationManagement(
        "APP_MEMBER_REMOVED",
        currentUser.userId,
        orgId,
        {
          metadata: {
            appId,
            appName: app.name,
            targetUserId: userId,
            targetEmail: membership.user.email,
            roleType: membership.roleType,
          },
        }
      );

      Logger.info("App member removed", {
        membershipId: membership.id,
        userId,
        appId,
        orgId,
        removedBy: currentUser.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "User removed from app",
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to remove app member", { appId, userId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to remove app member", "DB_ERROR"),
        500
      );
    }
  }
);

export default appMembers;
