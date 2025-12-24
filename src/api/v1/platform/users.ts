/**
 * Platform Memberships API
 *
 * Manages platform-level access through PlatformMembership model.
 * Only SUPER_ADMIN can grant/revoke platform access.
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
import { hashPassword, type TokenPayload } from "@z0/utils/auth";
import { validatePassword } from "@z0/utils/password-validation";
import { requireSuperAdmin } from "./middleware";
import { PLATFORM_ROLE_SCOPES } from "@z0/utils/scopes";
import { AuditLogger } from "@z0/utils/audit-logger";

const platformUsers = new Hono();

/**
 * Schema for granting platform access
 */
const grantPlatformAccessSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required").max(100),
  password: z.string().min(8).optional(), // Optional if user exists
  roleType: z
    .enum([
      "SUPER_ADMIN",
      "ORG_MANAGER",
      "SECURITY_MANAGER",
      "AUDITOR",
      "SUPPORT_MANAGER",
    ])
    .default("SUPPORT_MANAGER"),
  scopes: z.array(z.string()).optional(), // Override default role scopes
});

/**
 * Schema for updating platform membership
 */
const updateMembershipSchema = z.object({
  roleType: z
    .enum([
      "SUPER_ADMIN",
      "ORG_MANAGER",
      "SECURITY_MANAGER",
      "AUDITOR",
      "SUPPORT_MANAGER",
    ])
    .optional(),
  scopes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/v1/platform/users
 * List all platform members (users with platform access)
 */
platformUsers.get("/", async (c) => {
  const requestId = RequestContext.generateRequestId();

  try {
    const memberships = await db.platformMembership.findMany({
      where: { isActive: true },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            status: true,
            emailVerified: true,
            lastLoginAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { grantedAt: "desc" },
    });

    // Transform to cleaner response format
    const members = memberships.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      avatar: m.user.avatar,
      roleType: m.roleType,
      scopes: m.scopes,
      status: m.user.status,
      emailVerified: m.user.emailVerified,
      lastLoginAt: m.user.lastLoginAt,
      grantedAt: m.grantedAt,
      grantedBy: m.grantedBy,
      userCreatedAt: m.user.createdAt,
    }));

    return c.json({
      success: true,
      data: members,
      total: members.length,
      requestId,
    });
  } catch (error) {
    Logger.error("Failed to list platform members", { error });
    return c.json(
      ErrorResponseBuilder.system("Failed to list platform members", "DB_ERROR"),
      500
    );
  }
});

/**
 * GET /api/v1/platform/users/:userId
 * Get specific platform member details
 */
platformUsers.get("/:userId", async (c) => {
  const userId = c.req.param("userId");
  const requestId = RequestContext.generateRequestId();

  try {
    const membership = await db.platformMembership.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            status: true,
            emailVerified: true,
            twoFactorEnabled: true,
            lastLoginAt: true,
            loginCount: true,
            createdAt: true,
            updatedAt: true,
            // Include org memberships for context
            organizationMemberships: {
              where: { isActive: true },
              include: {
                organization: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
          },
        },
      },
    });

    if (!membership) {
      return c.json(
        ErrorResponseBuilder.notFound("Platform member not found"),
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
        scopes: membership.scopes,
        isActive: membership.isActive,
        grantedAt: membership.grantedAt,
        grantedBy: membership.grantedBy,
      },
      requestId,
    });
  } catch (error) {
    Logger.error("Failed to fetch platform member", { userId, error });
    return c.json(
      ErrorResponseBuilder.system("Failed to fetch platform member", "DB_ERROR"),
      500
    );
  }
});

/**
 * POST /api/v1/platform/users
 * Grant platform access to a user
 * - If user exists, create membership
 * - If user doesn't exist, create user and membership
 */
platformUsers.post(
  "/",
  requireSuperAdmin,
  validator("json", (value, c) => {
    const parsed = grantPlatformAccessSchema.safeParse(value);
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
    const data = c.req.valid("json");
    const currentUser = c.get("user") as TokenPayload;
    const requestId = RequestContext.generateRequestId();

    try {
      // Check if user exists
      let user = await db.user.findUnique({
        where: { email: data.email },
      });

      // Check for existing platform membership
      if (user) {
        const existingMembership = await db.platformMembership.findUnique({
          where: { userId: user.id },
        });

        if (existingMembership) {
          if (existingMembership.isActive) {
            return c.json(
              ErrorResponseBuilder.conflict(
                "User already has platform access"
              ),
              409
            );
          }

          // Reactivate membership
          const reactivated = await db.platformMembership.update({
            where: { id: existingMembership.id },
            data: {
              isActive: true,
              roleType: data.roleType,
              scopes: data.scopes || PLATFORM_ROLE_SCOPES[data.roleType],
              grantedBy: currentUser.userId,
              grantedAt: new Date(),
            },
          });

          Logger.info("Platform membership reactivated", {
            membershipId: reactivated.id,
            userId: user.id,
            roleType: data.roleType,
            grantedBy: currentUser.userId,
          });

          return c.json(
            {
              success: true,
              message: "Platform access reactivated",
              data: {
                membershipId: reactivated.id,
                userId: user.id,
                email: user.email,
                roleType: reactivated.roleType,
              },
              requestId,
            },
            200
          );
        }
      }

      // If user doesn't exist, create them
      if (!user) {
        if (!data.password) {
          return c.json(
            ErrorResponseBuilder.validation(
              "Password required for new user creation",
              [{ field: "password", message: "Password is required", code: "required" }]
            ),
            400
          );
        }

        const pwdValidation = validatePassword(data.password);
        if (!pwdValidation.isValid) {
          return c.json(
            ErrorResponseBuilder.validation("Password does not meet requirements", [], {
              feedback: pwdValidation.feedback,
            }),
            400
          );
        }

        const hashedPassword = await hashPassword(data.password);

        user = await db.user.create({
          data: {
            email: data.email,
            name: data.name,
            password: hashedPassword,
            status: "ACTIVE",
            emailVerified: true, // Platform users are auto-verified
          },
        });
      }

      // Create platform membership
      const membership = await db.platformMembership.create({
        data: {
          userId: user.id,
          roleType: data.roleType,
          scopes: data.scopes || PLATFORM_ROLE_SCOPES[data.roleType],
          isActive: true,
          grantedBy: currentUser.userId,
        },
      });

      // Audit log
      await AuditLogger.logPlatformManagement(
        "PLATFORM_ACCESS_GRANTED",
        currentUser.userId,
        {
          metadata: {
            targetUserId: user.id,
            targetEmail: user.email,
            roleType: data.roleType,
            membershipId: membership.id,
          },
        }
      );

      Logger.info("Platform access granted", {
        membershipId: membership.id,
        userId: user.id,
        roleType: data.roleType,
        grantedBy: currentUser.userId,
        requestId,
      });

      return c.json(
        {
          success: true,
          message: "Platform access granted",
          data: {
            membershipId: membership.id,
            userId: user.id,
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
      Logger.error("Failed to grant platform access", {
        email: data.email,
        error: dbError.message,
      });
      return c.json(
        ErrorResponseBuilder.database("Failed to grant platform access", dbError.code),
        500
      );
    }
  }
);

/**
 * PATCH /api/v1/platform/users/:userId
 * Update platform membership
 */
platformUsers.patch(
  "/:userId",
  requireSuperAdmin,
  validator("json", (value, c) => {
    const parsed = updateMembershipSchema.safeParse(value);
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
    const userId = c.req.param("userId");
    const data = c.req.valid("json");
    const currentUser = c.get("user") as TokenPayload;
    const requestId = RequestContext.generateRequestId();

    try {
      const membership = await db.platformMembership.findUnique({
        where: { userId },
        include: { user: { select: { email: true } } },
      });

      if (!membership) {
        return c.json(
          ErrorResponseBuilder.notFound("Platform member not found"),
          404
        );
      }

      // Prevent demoting yourself from SUPER_ADMIN if you're the only one
      if (
        data.roleType &&
        data.roleType !== "SUPER_ADMIN" &&
        membership.roleType === "SUPER_ADMIN" &&
        currentUser.userId === userId
      ) {
        const superAdminCount = await db.platformMembership.count({
          where: { roleType: "SUPER_ADMIN", isActive: true },
        });

        if (superAdminCount <= 1) {
          return c.json(
            ErrorResponseBuilder.forbidden(
              "Cannot demote yourself - you are the only Super Admin"
            ),
            403
          );
        }
      }

      // Prevent deactivating yourself
      if (data.isActive === false && currentUser.userId === userId) {
        return c.json(
          ErrorResponseBuilder.forbidden("Cannot revoke your own platform access"),
          403
        );
      }

      const oldRoleType = membership.roleType;

      const updated = await db.platformMembership.update({
        where: { id: membership.id },
        data: {
          ...(data.roleType && { roleType: data.roleType }),
          ...(data.scopes && { scopes: data.scopes }),
          ...(typeof data.isActive === "boolean" && { isActive: data.isActive }),
        },
      });

      // Audit log role changes
      if (data.roleType && data.roleType !== oldRoleType) {
        await AuditLogger.logPlatformManagement(
          "PLATFORM_ROLE_CHANGED",
          currentUser.userId,
          {
            metadata: {
              targetUserId: userId,
              targetEmail: membership.user.email,
              oldRoleType,
              newRoleType: data.roleType,
            },
          }
        );
      }

      Logger.info("Platform membership updated", {
        membershipId: membership.id,
        userId,
        changes: data,
        updatedBy: currentUser.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "Platform membership updated",
        data: {
          membershipId: updated.id,
          userId,
          roleType: updated.roleType,
          scopes: updated.scopes,
          isActive: updated.isActive,
        },
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to update platform membership", { userId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to update platform membership", "DB_ERROR"),
        500
      );
    }
  }
);

/**
 * DELETE /api/v1/platform/users/:userId
 * Revoke platform access (deactivate membership)
 */
platformUsers.delete("/:userId", requireSuperAdmin, async (c) => {
  const userId = c.req.param("userId");
  const currentUser = c.get("user") as TokenPayload;
  const requestId = RequestContext.generateRequestId();

  // Prevent revoking your own access
  if (currentUser.userId === userId) {
    return c.json(
      ErrorResponseBuilder.forbidden("Cannot revoke your own platform access"),
      403
    );
  }

  try {
    const membership = await db.platformMembership.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } },
    });

    if (!membership) {
      return c.json(
        ErrorResponseBuilder.notFound("Platform member not found"),
        404
      );
    }

    if (!membership.isActive) {
      return c.json(
        ErrorResponseBuilder.conflict("Platform access already revoked"),
        409
      );
    }

    // Prevent removing the last super admin
    if (membership.roleType === "SUPER_ADMIN") {
      const superAdminCount = await db.platformMembership.count({
        where: { roleType: "SUPER_ADMIN", isActive: true },
      });

      if (superAdminCount <= 1) {
        return c.json(
          ErrorResponseBuilder.forbidden(
            "Cannot revoke access - this is the only Super Admin"
          ),
          403
        );
      }
    }

    // Soft delete (deactivate)
    await db.platformMembership.update({
      where: { id: membership.id },
      data: { isActive: false },
    });

    // Audit log
    await AuditLogger.logPlatformManagement(
      "PLATFORM_ACCESS_REVOKED",
      currentUser.userId,
      {
        metadata: {
          targetUserId: userId,
          targetEmail: membership.user.email,
          roleType: membership.roleType,
        },
      }
    );

    Logger.info("Platform access revoked", {
      membershipId: membership.id,
      userId,
      revokedBy: currentUser.userId,
      requestId,
    });

    return c.json({
      success: true,
      message: "Platform access revoked",
      requestId,
    });
  } catch (error) {
    Logger.error("Failed to revoke platform access", { userId, error });
    return c.json(
      ErrorResponseBuilder.system("Failed to revoke platform access", "DB_ERROR"),
      500
    );
  }
});

export default platformUsers;
