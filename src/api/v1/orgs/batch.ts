/**
 * Batch Operations API
 * Perform bulk operations efficiently
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
import { randomBytes } from "crypto";
import { checkUserQuota, isPlatformAdmin } from "@z0/utils/quota";
import { dispatchWebhook } from "@z0/utils/webhooks";

const batch = new Hono();

const INVITATION_EXPIRY_DAYS = 7;
const MAX_BATCH_SIZE = 100;

function generateInvitationToken(): string {
  const random = randomBytes(32).toString("base64url");
  return `inv_${random}`;
}

// Schemas
const batchInviteSchema = z.object({
  invitations: z
    .array(
      z.object({
        email: z.string().email(),
        roleType: z
          .enum(["ORG_OWNER", "ORG_ADMIN", "ORG_MEMBER"])
          .optional()
          .default("ORG_MEMBER"),
        message: z.string().max(500).optional(),
      })
    )
    .min(1)
    .max(MAX_BATCH_SIZE),
  skipExisting: z.boolean().optional().default(true),
});

const batchDeleteSessionsSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH_SIZE).optional(),
  excludeCurrentSession: z.boolean().optional().default(true),
  olderThan: z.string().datetime().optional(),
});

const batchUpdateMetadataSchema = z.object({
  users: z
    .array(
      z.object({
        userId: z.string().uuid(),
        metadata: z.record(z.any()),
        merge: z.boolean().optional().default(true),
      })
    )
    .min(1)
    .max(MAX_BATCH_SIZE),
});

type BatchInviteResult = {
  email: string;
  success: boolean;
  invitationId?: string;
  error?: string;
};

type BatchSessionResult = {
  userId?: string;
  sessionsDeleted: number;
  error?: string;
};

type BatchMetadataResult = {
  userId: string;
  success: boolean;
  error?: string;
};

/**
 * POST /api/v1/orgs/:orgId/batch/invite
 * Batch invite multiple users to organization
 */
batch.post(
  "/:orgId/batch/invite",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:members:write"),
  validator("json", (value, c) => {
    const parsed = batchInviteSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid batch invite data",
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
    const orgId = c.req.param("orgId");
    const user = c.get("user") as TokenPayload;
    const data = c.req.valid("json");

    try {
      const results: BatchInviteResult[] = [];
      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      // Check quota first (unless platform admin)
      if (!isPlatformAdmin(user.platformRole)) {
        const quotaCheck = await checkUserQuota(orgId);
        if (!quotaCheck.allowed) {
          return c.json(
            ErrorResponseBuilder.validation("Organization capacity reached", [
              {
                field: "organization",
                message: quotaCheck.reason || "Maximum user limit reached",
              },
            ]),
            400
          );
        }
      }

      // Get existing members and pending invitations
      const existingEmails = new Set<string>();

      const existingMembers = await db.organizationMembership.findMany({
        where: { organizationId: orgId, isActive: true },
        include: { user: { select: { email: true } } },
      });
      existingMembers.forEach((m) => existingEmails.add(m.user.email));

      const pendingInvitations = await db.invitation.findMany({
        where: {
          organizationId: orgId,
          acceptedAt: null,
          declinedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { email: true },
      });
      pendingInvitations.forEach((i) => existingEmails.add(i.email));

      // Process each invitation
      for (const inv of data.invitations) {
        if (existingEmails.has(inv.email)) {
          if (data.skipExisting) {
            results.push({
              email: inv.email,
              success: false,
              error: "User is already a member or has pending invitation",
            });
            skipCount++;
          } else {
            results.push({
              email: inv.email,
              success: false,
              error: "User is already a member or has pending invitation",
            });
            errorCount++;
          }
          continue;
        }

        try {
          const token = generateInvitationToken();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

          const invitation = await db.invitation.create({
            data: {
              organizationId: orgId,
              email: inv.email,
              roleType: inv.roleType,
              message: inv.message,
              token,
              expiresAt,
              invitedById: user.userId,
            },
          });

          existingEmails.add(inv.email);
          results.push({
            email: inv.email,
            success: true,
            invitationId: invitation.id,
          });
          successCount++;

          // Dispatch webhook for each invite
          await dispatchWebhook({
            organizationId: orgId,
            eventType: "member.added",
            data: {
              type: "batch_invitation",
              invitationId: invitation.id,
              email: inv.email,
              roleType: inv.roleType,
              invitedBy: user.userId,
            },
            metadata: {
              userId: user.userId,
              requestId,
            },
          });
        } catch (error: any) {
          results.push({
            email: inv.email,
            success: false,
            error: error.message || "Failed to create invitation",
          });
          errorCount++;
        }
      }

      // Audit log for batch operation
      await AuditLogger.logOrganizationManagement("BATCH_INVITE", user.userId, orgId, {
        metadata: {
          totalRequested: data.invitations.length,
          successCount,
          skipCount,
          errorCount,
        },
      });

      Logger.info("Batch invite completed", {
        orgId,
        userId: user.userId,
        total: data.invitations.length,
        success: successCount,
        skipped: skipCount,
        errors: errorCount,
        requestId,
      });

      return c.json({
        success: true,
        message: `Batch invite completed: ${successCount} sent, ${skipCount} skipped, ${errorCount} failed`,
        data: {
          results,
          summary: {
            total: data.invitations.length,
            success: successCount,
            skipped: skipCount,
            errors: errorCount,
          },
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Batch invite failed", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Batch invite failed", "BATCH_FAILED"),
        500
      );
    }
  }
);

/**
 * POST /api/v1/orgs/:orgId/batch/sessions/delete
 * Batch delete sessions for users in organization
 */
batch.post(
  "/:orgId/batch/sessions/delete",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:sessions:manage"),
  validator("json", (value, c) => {
    const parsed = batchDeleteSessionsSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid batch session data",
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
    const orgId = c.req.param("orgId");
    const user = c.get("user") as TokenPayload;
    const data = c.req.valid("json");

    try {
      // Build where clause for sessions
      const whereClause: any = {};

      // If specific userIds provided, validate they're in the org
      if (data.userIds && data.userIds.length > 0) {
        const orgMembers = await db.organizationMembership.findMany({
          where: {
            organizationId: orgId,
            userId: { in: data.userIds },
            isActive: true,
          },
          select: { userId: true },
        });

        const validUserIds = orgMembers.map((m) => m.userId);
        if (validUserIds.length === 0) {
          return c.json(
            ErrorResponseBuilder.validation("No valid users found", [
              { field: "userIds", message: "None of the specified users are members of this organization" },
            ]),
            400
          );
        }

        whereClause.userId = { in: validUserIds };
      } else {
        // All users in org
        const orgMembers = await db.organizationMembership.findMany({
          where: { organizationId: orgId, isActive: true },
          select: { userId: true },
        });
        whereClause.userId = { in: orgMembers.map((m) => m.userId) };
      }

      // Exclude current session if requested
      if (data.excludeCurrentSession && user.sessionId) {
        whereClause.id = { not: user.sessionId };
      }

      // Filter by age if specified
      if (data.olderThan) {
        whereClause.createdAt = { lt: new Date(data.olderThan) };
      }

      // Only delete active sessions
      whereClause.isActive = true;

      const deleteResult = await db.session.updateMany({
        where: whereClause,
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });

      // Audit log
      await AuditLogger.logOrganizationManagement("BATCH_SESSION_DELETE", user.userId, orgId, {
        metadata: {
          sessionsRevoked: deleteResult.count,
          userIds: data.userIds,
          excludedCurrent: data.excludeCurrentSession,
          olderThan: data.olderThan,
        },
      });

      Logger.info("Batch session delete completed", {
        orgId,
        userId: user.userId,
        sessionsDeleted: deleteResult.count,
        requestId,
      });

      return c.json({
        success: true,
        message: `${deleteResult.count} sessions revoked`,
        data: {
          sessionsRevoked: deleteResult.count,
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Batch session delete failed", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Batch session delete failed", "BATCH_FAILED"),
        500
      );
    }
  }
);

/**
 * POST /api/v1/orgs/:orgId/batch/users/metadata
 * Batch update user metadata for users in organization
 */
batch.post(
  "/:orgId/batch/users/metadata",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:members:manage"),
  validator("json", (value, c) => {
    const parsed = batchUpdateMetadataSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid batch metadata data",
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
    const orgId = c.req.param("orgId");
    const user = c.get("user") as TokenPayload;
    const data = c.req.valid("json");

    try {
      const results: BatchMetadataResult[] = [];
      let successCount = 0;
      let errorCount = 0;

      // Validate all users are in the organization
      const orgMembers = await db.organizationMembership.findMany({
        where: {
          organizationId: orgId,
          userId: { in: data.users.map((u) => u.userId) },
          isActive: true,
        },
        select: { userId: true },
      });
      const validUserIds = new Set(orgMembers.map((m) => m.userId));

      for (const userUpdate of data.users) {
        if (!validUserIds.has(userUpdate.userId)) {
          results.push({
            userId: userUpdate.userId,
            success: false,
            error: "User is not a member of this organization",
          });
          errorCount++;
          continue;
        }

        try {
          const currentUser = await db.user.findUnique({
            where: { id: userUpdate.userId },
            select: { metadata: true },
          });

          const newMetadata = userUpdate.merge
            ? { ...(currentUser?.metadata as object || {}), ...userUpdate.metadata }
            : userUpdate.metadata;

          await db.user.update({
            where: { id: userUpdate.userId },
            data: { metadata: newMetadata },
          });

          results.push({
            userId: userUpdate.userId,
            success: true,
          });
          successCount++;
        } catch (error: any) {
          results.push({
            userId: userUpdate.userId,
            success: false,
            error: error.message || "Failed to update metadata",
          });
          errorCount++;
        }
      }

      // Audit log
      await AuditLogger.logOrganizationManagement("BATCH_METADATA_UPDATE", user.userId, orgId, {
        metadata: {
          totalRequested: data.users.length,
          successCount,
          errorCount,
        },
      });

      Logger.info("Batch metadata update completed", {
        orgId,
        userId: user.userId,
        total: data.users.length,
        success: successCount,
        errors: errorCount,
        requestId,
      });

      return c.json({
        success: true,
        message: `Batch metadata update completed: ${successCount} updated, ${errorCount} failed`,
        data: {
          results,
          summary: {
            total: data.users.length,
            success: successCount,
            errors: errorCount,
          },
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Batch metadata update failed", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Batch metadata update failed", "BATCH_FAILED"),
        500
      );
    }
  }
);

export default batch;
