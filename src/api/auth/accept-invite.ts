/**
 * Accept Invitation Endpoints
 * Public endpoints for accepting organization invitations
 */

import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import {
  ErrorResponseBuilder,
  RequestContext,
  Logger,
} from "@z0/utils/error-handling";
import { z } from "zod";
import { validator } from "hono/validator";
import { verifyAccessTokenMiddleware, type TokenPayload } from "@z0/utils/auth";
import { AuditLogger } from "@z0/utils/audit-logger";
import { dispatchWebhook } from "@z0/utils/webhooks";

const acceptInvite = new Hono();

const acceptInvitationSchema = z.object({
  token: z.string().min(1),
});

/**
 * GET /api/auth/accept-invite/:token
 * Validate invitation token (public)
 */
acceptInvite.get("/:token", async (c) => {
  const requestId = RequestContext.generateRequestId();
  const token = c.req.param("token");

  try {
    const invitation = await db.invitation.findUnique({
      where: { token },
      select: {
        id: true,
        email: true,
        roleType: true,
        message: true,
        expiresAt: true,
        acceptedAt: true,
        declinedAt: true,
        revokedAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        invitedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!invitation) {
      return c.json(
        ErrorResponseBuilder.notFound("Invalid or expired invitation"),
        404
      );
    }

    if (invitation.acceptedAt) {
      return c.json(
        ErrorResponseBuilder.conflict("This invitation has already been accepted"),
        409
      );
    }

    if (invitation.declinedAt) {
      return c.json(
        ErrorResponseBuilder.conflict("This invitation has been declined"),
        409
      );
    }

    if (invitation.revokedAt) {
      return c.json(
        ErrorResponseBuilder.conflict("This invitation has been revoked"),
        410
      );
    }

    if (invitation.expiresAt < new Date()) {
      return c.json(
        ErrorResponseBuilder.validation("Invitation has expired", [
          {
            field: "token",
            message: "This invitation has expired. Please request a new one.",
          },
        ]),
        410
      );
    }

    return c.json({
      success: true,
      data: {
        id: invitation.id,
        email: invitation.email,
        roleType: invitation.roleType,
        message: invitation.message,
        organization: invitation.organization,
        invitedBy: invitation.invitedBy,
        expiresAt: invitation.expiresAt,
      },
      requestId,
    });
  } catch (error: any) {
    Logger.error("Failed to validate invitation", { error: error.message, requestId });
    return c.json(
      ErrorResponseBuilder.system("Failed to validate invitation", "VALIDATION_FAILED"),
      500
    );
  }
});

/**
 * POST /api/auth/accept-invite/:token
 * Accept invitation (requires authentication)
 */
acceptInvite.post(
  "/:token",
  verifyAccessTokenMiddleware,
  async (c) => {
    const requestId = RequestContext.generateRequestId();
    const token = c.req.param("token");
    const user = c.get("user") as TokenPayload;

    try {
      const invitation = await db.invitation.findUnique({
        where: { token },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              maxUsers: true,
              _count: {
                select: { memberships: { where: { isActive: true } } },
              },
            },
          },
        },
      });

      if (!invitation) {
        return c.json(
          ErrorResponseBuilder.notFound("Invalid or expired invitation"),
          404
        );
      }

      if (invitation.acceptedAt) {
        return c.json(
          ErrorResponseBuilder.conflict("This invitation has already been accepted"),
          409
        );
      }

      if (invitation.revokedAt) {
        return c.json(
          ErrorResponseBuilder.conflict("This invitation has been revoked"),
          410
        );
      }

      if (invitation.expiresAt < new Date()) {
        return c.json(
          ErrorResponseBuilder.validation("Invitation has expired", [
            {
              field: "token",
              message: "This invitation has expired. Please request a new one.",
            },
          ]),
          410
        );
      }

      const currentUser = await db.user.findUnique({
        where: { id: user.userId },
        select: { email: true },
      });

      if (!currentUser) {
        return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
      }

      if (currentUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
        return c.json(
          ErrorResponseBuilder.authorization(
            "This invitation was sent to a different email address"
          ),
          403
        );
      }

      const existingMembership = await db.organizationMembership.findFirst({
        where: {
          userId: user.userId,
          organizationId: invitation.organizationId,
        },
      });

      if (existingMembership && existingMembership.isActive) {
        return c.json(
          ErrorResponseBuilder.conflict("You are already a member of this organization"),
          409
        );
      }

      if (
        invitation.organization.maxUsers &&
        invitation.organization._count.memberships >= invitation.organization.maxUsers
      ) {
        return c.json(
          ErrorResponseBuilder.validation("Organization capacity reached", [
            {
              field: "organization",
              message: "This organization has reached its maximum user capacity",
            },
          ]),
          400
        );
      }

      await db.$transaction(async (tx) => {
        if (existingMembership) {
          await tx.organizationMembership.update({
            where: { id: existingMembership.id },
            data: {
              isActive: true,
              roleType: invitation.roleType,
              grantedAt: new Date(),
              grantedBy: invitation.invitedById,
            },
          });
        } else {
          await tx.organizationMembership.create({
            data: {
              userId: user.userId,
              organizationId: invitation.organizationId,
              roleType: invitation.roleType,
              isActive: true,
              grantedBy: invitation.invitedById,
            },
          });
        }

        await tx.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
      });

      await AuditLogger.logOrganizationManagement(
        "MEMBER_JOINED",
        user.userId,
        invitation.organizationId,
        {
          metadata: {
            invitationId: invitation.id,
            roleType: invitation.roleType,
            invitedBy: invitation.invitedById,
          },
        }
      );

      await dispatchWebhook({
        organizationId: invitation.organizationId,
        eventType: "member.added",
        data: {
          type: "invitation_accepted",
          userId: user.userId,
          email: invitation.email,
          roleType: invitation.roleType,
          invitationId: invitation.id,
        },
        metadata: {
          userId: user.userId,
          requestId,
        },
      });

      Logger.info("Invitation accepted", {
        invitationId: invitation.id,
        userId: user.userId,
        orgId: invitation.organizationId,
        roleType: invitation.roleType,
        requestId,
      });

      return c.json({
        success: true,
        message: `You have joined ${invitation.organization.name}`,
        data: {
          organization: {
            id: invitation.organization.id,
            name: invitation.organization.name,
            slug: invitation.organization.slug,
          },
          roleType: invitation.roleType,
        },
        requestId,
      });
    } catch (error: any) {
      Logger.error("Failed to accept invitation", { error: error.message, requestId });
      return c.json(
        ErrorResponseBuilder.system("Failed to accept invitation", "ACCEPT_FAILED"),
        500
      );
    }
  }
);

/**
 * POST /api/auth/decline-invite/:token
 * Decline invitation (public)
 */
acceptInvite.post("/decline/:token", async (c) => {
  const requestId = RequestContext.generateRequestId();
  const token = c.req.param("token");

  try {
    const invitation = await db.invitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      return c.json(
        ErrorResponseBuilder.notFound("Invalid or expired invitation"),
        404
      );
    }

    if (invitation.acceptedAt) {
      return c.json(
        ErrorResponseBuilder.conflict("This invitation has already been accepted"),
        409
      );
    }

    if (invitation.declinedAt) {
      return c.json(
        ErrorResponseBuilder.conflict("This invitation has already been declined"),
        409
      );
    }

    if (invitation.revokedAt) {
      return c.json(
        ErrorResponseBuilder.conflict("This invitation has been revoked"),
        410
      );
    }

    await db.invitation.update({
      where: { id: invitation.id },
      data: { declinedAt: new Date() },
    });

    Logger.info("Invitation declined", {
      invitationId: invitation.id,
      email: invitation.email,
      orgId: invitation.organizationId,
      requestId,
    });

    return c.json({
      success: true,
      message: "Invitation declined",
      requestId,
    });
  } catch (error: any) {
    Logger.error("Failed to decline invitation", { error: error.message, requestId });
    return c.json(
      ErrorResponseBuilder.system("Failed to decline invitation", "DECLINE_FAILED"),
      500
    );
  }
});

export default acceptInvite;
