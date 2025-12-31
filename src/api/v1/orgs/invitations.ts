/**
 * Organization Invitations API
 * Invite users to join an organization
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
import { dispatchWebhook } from "@z0/utils/webhooks";
import { checkUserQuota, isPlatformAdmin } from "@z0/utils/quota";

const invitations = new Hono();

const INVITATION_EXPIRY_DAYS = 7;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

/**
 * Check if email service is configured
 */
function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER);
}

/**
 * Generate email content for invitation
 */
function generateInvitationEmailContent(
  orgName: string,
  inviteUrl: string,
  message?: string
): { subject: string; body: string } {
  const subject = `You've been invited to join ${orgName}`;

  let body = `Hello,

You've been invited to join ${orgName} on Z0.

Click here to accept: ${inviteUrl}
`;

  if (message) {
    body += `
Message from the inviter:
${message}
`;
  }

  body += `
This invitation expires in ${INVITATION_EXPIRY_DAYS} days.

If you did not expect this invitation, you can ignore this email.
`;

  return { subject, body };
}

function generateInvitationToken(): string {
  const random = randomBytes(32).toString("base64url");
  return `inv_${random}`;
}

const createInvitationSchema = z.object({
  email: z.string().email(),
  roleType: z.enum(["ORG_OWNER", "ORG_ADMIN", "ORG_MEMBER"]).optional().default("ORG_MEMBER"),
  message: z.string().max(500).optional(),
});

const resendInvitationSchema = z.object({
  extendExpiry: z.boolean().optional().default(true),
});

/**
 * GET /api/v1/orgs/:orgId/invitations
 * List pending invitations
 */
invitations.get(
  "/:orgId/invitations",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const status = c.req.query("status") || "pending";

    try {
      let whereClause: any = { organizationId: orgId };

      if (status === "pending") {
        whereClause = {
          ...whereClause,
          acceptedAt: null,
          declinedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        };
      } else if (status === "accepted") {
        whereClause = {
          ...whereClause,
          acceptedAt: { not: null },
        };
      } else if (status === "expired") {
        whereClause = {
          ...whereClause,
          acceptedAt: null,
          declinedAt: null,
          revokedAt: null,
          expiresAt: { lt: new Date() },
        };
      } else if (status === "revoked") {
        whereClause = {
          ...whereClause,
          revokedAt: { not: null },
        };
      }

      const invitationList = await db.invitation.findMany({
        where: whereClause,
        select: {
          id: true,
          email: true,
          roleType: true,
          message: true,
          expiresAt: true,
          acceptedAt: true,
          declinedAt: true,
          revokedAt: true,
          createdAt: true,
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const data = invitationList.map((inv) => ({
        ...inv,
        status: inv.acceptedAt
          ? "accepted"
          : inv.declinedAt
            ? "declined"
            : inv.revokedAt
              ? "revoked"
              : inv.expiresAt < new Date()
                ? "expired"
                : "pending",
      }));

      return c.json({
        success: true,
        data,
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to list invitations", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to list invitations", "FETCH_FAILED"),
        500
      );
    }
  }
);

/**
 * POST /api/v1/orgs/:orgId/invitations
 * Send invitation
 */
invitations.post(
  "/:orgId/invitations",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:members:write"),
  validator("json", (value, c) => {
    const parsed = createInvitationSchema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Invalid invitation data",
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
      // Get organization name for email content
      const organization = await db.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      });

      if (!organization) {
        return c.json(ErrorResponseBuilder.notFound("Organization not found"), 404);
      }

      const existingUser = await db.user.findUnique({
        where: { email: data.email },
        include: {
          organizationMemberships: {
            where: { organizationId: orgId, isActive: true },
          },
        },
      });

      if (existingUser && existingUser.organizationMemberships.length > 0) {
        return c.json(
          ErrorResponseBuilder.conflict("User is already a member of this organization"),
          409
        );
      }

      const existingInvitation = await db.invitation.findFirst({
        where: {
          organizationId: orgId,
          email: data.email,
          acceptedAt: null,
          declinedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (existingInvitation) {
        return c.json(
          ErrorResponseBuilder.conflict(
            "A pending invitation already exists for this email. Use resend to extend it."
          ),
          409
        );
      }

      // Check user quota (platform admins bypass)
      if (!isPlatformAdmin(user.platformRole)) {
        const quotaCheck = await checkUserQuota(orgId);
        if (!quotaCheck.allowed) {
          return c.json(
            ErrorResponseBuilder.validation("Organization capacity reached", [
              {
                field: "email",
                message: quotaCheck.reason || "Maximum user limit reached",
              },
            ]),
            400
          );
        }
      }

      const token = generateInvitationToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

      const invitation = await db.invitation.create({
        data: {
          organizationId: orgId,
          email: data.email,
          roleType: data.roleType,
          message: data.message,
          token,
          expiresAt,
          invitedById: user.userId,
        },
        select: {
          id: true,
          email: true,
          roleType: true,
          message: true,
          token: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      await AuditLogger.logOrganizationManagement(
        "MEMBER_INVITED",
        user.userId,
        orgId,
        {
          metadata: {
            invitationId: invitation.id,
            email: data.email,
            roleType: data.roleType,
          },
        }
      );

      await dispatchWebhook({
        organizationId: orgId,
        eventType: "member.added",
        data: {
          type: "invitation",
          invitationId: invitation.id,
          email: data.email,
          roleType: data.roleType,
          invitedBy: user.userId,
        },
        metadata: {
          userId: user.userId,
          requestId,
        },
      });

      // Generate invite URL and email content
      const inviteUrl = `${APP_URL}/accept-invite/${invitation.token}`;
      const emailConfigured = isEmailConfigured();
      const emailContent = generateInvitationEmailContent(
        organization.name,
        inviteUrl,
        data.message
      );

      // TODO: If email is configured, send the email here
      // For now, we just return the content for the frontend to handle

      Logger.info("Invitation created", {
        invitationId: invitation.id,
        email: data.email,
        orgId,
        invitedBy: user.userId,
        emailConfigured,
        requestId,
      });

      return c.json(
        {
          success: true,
          message: emailConfigured
            ? `Invitation sent to ${data.email}`
            : `Invitation created for ${data.email}`,
          data: {
            ...invitation,
            inviteUrl,
            emailSent: emailConfigured,
            // Include email content for frontend mailto fallback if email not configured
            emailContent: !emailConfigured ? emailContent : undefined,
          },
          requestId,
        },
        201
      );
    } catch (error: any) {
      Logger.error("Failed to send invitation", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to send invitation", "CREATE_FAILED"),
        500
      );
    }
  }
);

/**
 * GET /api/v1/orgs/:orgId/invitations/:invitationId
 * Get invitation details
 */
invitations.get(
  "/:orgId/invitations/:invitationId",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const invitationId = c.req.param("invitationId");

    try {
      const invitation = await db.invitation.findFirst({
        where: {
          id: invitationId,
          organizationId: orgId,
        },
        select: {
          id: true,
          email: true,
          roleType: true,
          message: true,
          expiresAt: true,
          acceptedAt: true,
          declinedAt: true,
          revokedAt: true,
          createdAt: true,
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!invitation) {
        return c.json(ErrorResponseBuilder.notFound("Invitation not found"), 404);
      }

      const status = invitation.acceptedAt
        ? "accepted"
        : invitation.declinedAt
          ? "declined"
          : invitation.revokedAt
            ? "revoked"
            : invitation.expiresAt < new Date()
              ? "expired"
              : "pending";

      return c.json({
        success: true,
        data: {
          ...invitation,
          status,
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to get invitation", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to get invitation", "FETCH_FAILED"),
        500
      );
    }
  }
);

/**
 * DELETE /api/v1/orgs/:orgId/invitations/:invitationId
 * Cancel/revoke invitation
 */
invitations.delete(
  "/:orgId/invitations/:invitationId",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:members:write"),
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const invitationId = c.req.param("invitationId");
    const user = c.get("user") as TokenPayload;

    try {
      const invitation = await db.invitation.findFirst({
        where: {
          id: invitationId,
          organizationId: orgId,
        },
      });

      if (!invitation) {
        return c.json(ErrorResponseBuilder.notFound("Invitation not found"), 404);
      }

      if (invitation.acceptedAt) {
        return c.json(
          ErrorResponseBuilder.conflict("Cannot revoke an accepted invitation"),
          409
        );
      }

      if (invitation.revokedAt) {
        return c.json(
          ErrorResponseBuilder.conflict("Invitation is already revoked"),
          409
        );
      }

      await db.invitation.update({
        where: { id: invitationId },
        data: { revokedAt: new Date() },
      });

      await AuditLogger.logOrganizationManagement(
        "MEMBER_REMOVED",
        user.userId,
        orgId,
        {
          metadata: {
            type: "invitation_revoked",
            invitationId,
            email: invitation.email,
          },
        }
      );

      Logger.info("Invitation revoked", {
        invitationId,
        email: invitation.email,
        orgId,
        revokedBy: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "Invitation revoked successfully",
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to revoke invitation", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to revoke invitation", "DELETE_FAILED"),
        500
      );
    }
  }
);

/**
 * POST /api/v1/orgs/:orgId/invitations/:invitationId/resend
 * Resend invitation email
 */
invitations.post(
  "/:orgId/invitations/:invitationId/resend",
  verifyAccessTokenMiddleware,
  requireOrgAccess(),
  requireScope("org:members:write"),
  validator("json", (value, c) => {
    const parsed = resendInvitationSchema.safeParse(value);
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
    const requestId = RequestContext.generateRequestId();
    const orgId = c.req.param("orgId");
    const invitationId = c.req.param("invitationId");
    const user = c.get("user") as TokenPayload;
    const data = c.req.valid("json");

    try {
      const invitation = await db.invitation.findFirst({
        where: {
          id: invitationId,
          organizationId: orgId,
        },
      });

      if (!invitation) {
        return c.json(ErrorResponseBuilder.notFound("Invitation not found"), 404);
      }

      if (invitation.acceptedAt) {
        return c.json(
          ErrorResponseBuilder.conflict("Cannot resend an accepted invitation"),
          409
        );
      }

      if (invitation.revokedAt) {
        return c.json(
          ErrorResponseBuilder.conflict("Cannot resend a revoked invitation"),
          409
        );
      }

      const updateData: any = {};
      if (data.extendExpiry || invitation.expiresAt < new Date()) {
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + INVITATION_EXPIRY_DAYS);
        updateData.expiresAt = newExpiry;
      }

      const token = generateInvitationToken();
      updateData.token = token;

      const updated = await db.invitation.update({
        where: { id: invitationId },
        data: updateData,
        select: {
          id: true,
          email: true,
          token: true,
          expiresAt: true,
        },
      });

      // Get org name for email content
      const org = await db.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      });

      const inviteUrl = `${APP_URL}/accept-invite/${updated.token}`;
      const emailConfigured = isEmailConfigured();
      const emailContent = generateInvitationEmailContent(
        org?.name || "Organization",
        inviteUrl,
        invitation.message || undefined
      );

      Logger.info("Invitation resent", {
        invitationId,
        email: invitation.email,
        orgId,
        resentBy: user.userId,
        emailConfigured,
        requestId,
      });

      return c.json({
        success: true,
        message: emailConfigured
          ? `Invitation resent to ${invitation.email}`
          : `Invitation updated for ${invitation.email}`,
        data: {
          ...updated,
          inviteUrl,
          emailSent: emailConfigured,
          emailContent: !emailConfigured ? emailContent : undefined,
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to resend invitation", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to resend invitation", "RESEND_FAILED"),
        500
      );
    }
  }
);

export default invitations;
