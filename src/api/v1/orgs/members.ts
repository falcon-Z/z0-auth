/**
 * Organization Membership API
 *
 * Manages organization members through the OrganizationMembership model.
 * Users can be members of multiple organizations with different roles.
 */

import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import {
  Logger,
  DatabaseErrorHandler,
  ErrorResponseBuilder,
  RequestContext,
} from "@z0/utils/error-handling";
import { z } from "zod";
import { validator } from "hono/validator";
import {
  verifyAccessTokenMiddleware,
  hashPassword,
  type TokenPayload,
} from "@z0/utils/auth";
import { requireOrgAccess, requireScope } from "../../../middleware/require-scope";
import { validatePassword } from "@z0/utils/password-validation";
import { AuditLogger } from "@z0/utils/audit-logger";
import { checkUserQuota, isPlatformAdmin } from "@z0/utils/quota";

const orgMembers = new Hono();

// Schema for inviting/adding a member
const addMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8).optional(), // Optional if user exists
  roleType: z.enum(["ORG_OWNER", "ORG_ADMIN", "ORG_DEVELOPER", "ORG_MEMBER"]).default("ORG_MEMBER"),
});

// Schema for updating a membership
const updateMembershipSchema = z.object({
  roleType: z.enum(["ORG_OWNER", "ORG_ADMIN", "ORG_DEVELOPER", "ORG_MEMBER"]).optional(),
  isDefault: z.boolean().optional(),
});

/**
 * GET /:orgId/members
 * List organization memberships
 */
orgMembers.get(
  "/:orgId/members",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const orgId = c.req.param("orgId");
    const requestId = RequestContext.generateRequestId();

    try {
      const memberships = await db.organizationMembership.findMany({
        where: {
          organizationId: orgId,
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
              emailVerified: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: { grantedAt: "desc" },
      });

      // Transform to a cleaner response format
      const members = memberships.map((m) => ({
        membershipId: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        avatar: m.user.avatar,
        roleType: m.roleType,
        isDefault: m.isDefault,
        status: m.user.status,
        emailVerified: m.user.emailVerified,
        lastLoginAt: m.user.lastLoginAt,
        joinedAt: m.grantedAt,
        userCreatedAt: m.user.createdAt,
      }));

      return c.json({
        success: true,
        data: members,
        total: members.length,
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to list organization members", { orgId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to list members", "DB_ERROR"),
        500
      );
    }
  }
);

/**
 * POST /:orgId/members
 * Add a member to the organization
 * - If user exists, create membership
 * - If user doesn't exist, create user and membership
 */
orgMembers.post(
  "/:orgId/members",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:members:manage"),
  validator("json", (value, c) => {
    const parsed = addMemberSchema.safeParse(value);
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
    const data = c.req.valid("json");
    const currentUser = c.get("user") as TokenPayload;
    const requestId = RequestContext.generateRequestId();

    try {
      // Check if user already exists
      let user = await db.user.findUnique({
        where: { email: data.email },
      });

      // Check if membership already exists
      if (user) {
        const existingMembership = await db.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId: orgId,
            },
          },
        });

        if (existingMembership) {
          if (existingMembership.isActive) {
            return c.json(
              ErrorResponseBuilder.conflict(
                "User is already a member of this organization"
              ),
              409
            );
          }

          // Reactivate membership
          const reactivated = await db.organizationMembership.update({
            where: { id: existingMembership.id },
            data: {
              isActive: true,
              roleType: data.roleType,
              grantedBy: currentUser.userId,
              grantedAt: new Date(),
            },
          });

          Logger.info("Organization membership reactivated", {
            membershipId: reactivated.id,
            userId: user.id,
            orgId,
            reactivatedBy: currentUser.userId,
          });

          return c.json(
            {
              success: true,
              message: "User membership reactivated",
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

      // Check user quota (platform admins bypass) - only for new memberships, not reactivations
      if (!isPlatformAdmin(currentUser.platformRole)) {
        const quotaCheck = await checkUserQuota(orgId);
        if (!quotaCheck.allowed) {
          return c.json(
            ErrorResponseBuilder.validation("Organization capacity reached", [
              { field: "organization", message: quotaCheck.reason || "Maximum user limit reached" },
            ]),
            400
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
            emailVerified: false,
          },
        });
      }

      // Create the membership
      const membership = await db.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: orgId,
          roleType: data.roleType,
          isActive: true,
          isDefault: false, // Not default unless explicitly set
          grantedBy: currentUser.userId,
        },
      });

      // Audit log
      await AuditLogger.logOrganizationManagement(
        "MEMBER_ADDED",
        currentUser.userId,
        orgId,
        {
          metadata: {
            targetUserId: user.id,
            targetEmail: user.email,
            roleType: data.roleType,
            membershipId: membership.id,
          },
        }
      );

      Logger.info("Organization member added", {
        membershipId: membership.id,
        userId: user.id,
        orgId,
        roleType: data.roleType,
        addedBy: currentUser.userId,
        requestId,
      });

      return c.json(
        {
          success: true,
          message: "Member added to organization",
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
      Logger.error("Failed to add organization member", {
        orgId,
        email: data.email,
        error: dbError.message,
      });
      return c.json(
        ErrorResponseBuilder.database("Failed to add member", dbError.code),
        500
      );
    }
  }
);

/**
 * GET /:orgId/members/:userId
 * Get specific member details
 */
orgMembers.get(
  "/:orgId/members/:userId",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const orgId = c.req.param("orgId");
    const userId = c.req.param("userId");
    const requestId = RequestContext.generateRequestId();

    try {
      const membership = await db.organizationMembership.findFirst({
        where: {
          organizationId: orgId,
          userId,
        },
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
            },
          },
          role: true, // Custom role if assigned
        },
      });

      if (!membership) {
        return c.json(
          ErrorResponseBuilder.notFound("Member not found in this organization"),
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
          customRole: membership.role,
          isActive: membership.isActive,
          isDefault: membership.isDefault,
          grantedAt: membership.grantedAt,
          grantedBy: membership.grantedBy,
        },
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to fetch member details", { orgId, userId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to fetch member details", "DB_ERROR"),
        500
      );
    }
  }
);

/**
 * PATCH /:orgId/members/:userId
 * Update member's role in the organization
 */
orgMembers.patch(
  "/:orgId/members/:userId",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:members:manage"),
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
    const orgId = c.req.param("orgId");
    const userId = c.req.param("userId");
    const data = c.req.valid("json");
    const currentUser = c.get("user") as TokenPayload;
    const requestId = RequestContext.generateRequestId();

    try {
      const membership = await db.organizationMembership.findFirst({
        where: {
          organizationId: orgId,
          userId,
        },
      });

      if (!membership) {
        return c.json(
          ErrorResponseBuilder.notFound("Member not found in this organization"),
          404
        );
      }

      // Prevent demoting yourself from owner if you're the only owner
      if (
        data.roleType &&
        data.roleType !== "ORG_OWNER" &&
        membership.roleType === "ORG_OWNER" &&
        currentUser.userId === userId
      ) {
        const ownerCount = await db.organizationMembership.count({
          where: {
            organizationId: orgId,
            roleType: "ORG_OWNER",
            isActive: true,
          },
        });

        if (ownerCount <= 1) {
          return c.json(
            ErrorResponseBuilder.forbidden(
              "Cannot demote yourself - you are the only owner"
            ),
            403
          );
        }
      }

      const oldRoleType = membership.roleType;

      const updated = await db.organizationMembership.update({
        where: { id: membership.id },
        data: {
          ...(data.roleType && { roleType: data.roleType }),
          ...(typeof data.isDefault === "boolean" && { isDefault: data.isDefault }),
        },
      });

      // If setting as default, unset other defaults for this user
      if (data.isDefault === true) {
        await db.organizationMembership.updateMany({
          where: {
            userId,
            id: { not: membership.id },
          },
          data: { isDefault: false },
        });
      }

      // Audit log
      if (data.roleType && data.roleType !== oldRoleType) {
        await AuditLogger.logOrganizationManagement(
          "ROLE_CHANGED",
          currentUser.userId,
          orgId,
          {
            metadata: {
              targetUserId: userId,
              oldRoleType,
              newRoleType: data.roleType,
            },
          }
        );
      }

      Logger.info("Organization membership updated", {
        membershipId: membership.id,
        userId,
        orgId,
        changes: data,
        updatedBy: currentUser.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "Membership updated",
        data: {
          membershipId: updated.id,
          userId,
          roleType: updated.roleType,
          isDefault: updated.isDefault,
        },
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to update membership", { orgId, userId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to update membership", "DB_ERROR"),
        500
      );
    }
  }
);

/**
 * DELETE /:orgId/members/:userId
 * Remove a member from the organization (deactivate membership)
 */
orgMembers.delete(
  "/:orgId/members/:userId",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:members:manage"),
  async (c) => {
    const orgId = c.req.param("orgId");
    const userId = c.req.param("userId");
    const currentUser = c.get("user") as TokenPayload;
    const requestId = RequestContext.generateRequestId();

    try {
      // Prevent removing yourself
      if (currentUser.userId === userId) {
        return c.json(
          ErrorResponseBuilder.forbidden(
            "Cannot remove yourself from the organization"
          ),
          403
        );
      }

      const membership = await db.organizationMembership.findFirst({
        where: {
          organizationId: orgId,
          userId,
          isActive: true,
        },
        include: {
          user: { select: { email: true } },
        },
      });

      if (!membership) {
        return c.json(
          ErrorResponseBuilder.notFound("Member not found in this organization"),
          404
        );
      }

      // Prevent removing the last owner
      if (membership.roleType === "ORG_OWNER") {
        const ownerCount = await db.organizationMembership.count({
          where: {
            organizationId: orgId,
            roleType: "ORG_OWNER",
            isActive: true,
          },
        });

        if (ownerCount <= 1) {
          return c.json(
            ErrorResponseBuilder.forbidden(
              "Cannot remove the last owner of the organization"
            ),
            403
          );
        }
      }

      // Deactivate membership (soft delete)
      await db.organizationMembership.update({
        where: { id: membership.id },
        data: { isActive: false },
      });

      // Audit log
      await AuditLogger.logOrganizationManagement(
        "MEMBER_REMOVED",
        currentUser.userId,
        orgId,
        {
          metadata: {
            targetUserId: userId,
            targetEmail: membership.user.email,
            roleType: membership.roleType,
          },
        }
      );

      Logger.info("Organization member removed", {
        membershipId: membership.id,
        userId,
        orgId,
        removedBy: currentUser.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "Member removed from organization",
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to remove member", { orgId, userId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to remove member", "DB_ERROR"),
        500
      );
    }
  }
);

export default orgMembers;
