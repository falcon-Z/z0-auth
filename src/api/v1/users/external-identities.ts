/**
 * External Identity Management API
 * User self-service endpoints for managing linked OAuth accounts
 */

import { Hono } from "hono";
import { prisma } from "../../../utils/prisma";
import { authMiddleware } from "../../../middleware/auth";
import { OAuthService } from "../../../utils/oauth/oauth-service";
import { ErrorResponseBuilder } from "../../../utils/error-handling";
import { AuditLogger } from "../../../utils/audit-logger";

const externalIdentities = new Hono();

/**
 * GET /api/v1/users/external-identities
 * List user's linked external identities
 */
externalIdentities.get("/", authMiddleware, async (c) => {
  try {
    const user = c.get("user");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const identities = await prisma.externalIdentity.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        isPrimary: "desc",
      },
      select: {
        id: true,
        provider: true,
        providerType: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
        isPrimary: true,
        createdAt: true,
        lastUsedAt: true,
        // Don't expose tokens
      },
    });

    return c.json({ identities });
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to fetch external identities",
        "FETCH_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

/**
 * GET /api/v1/users/external-identities/:id
 * Get specific external identity details
 */
externalIdentities.get("/:id", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const identityId = c.req.param("id");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const identity = await prisma.externalIdentity.findFirst({
      where: {
        id: identityId,
        userId: user.id,
      },
      select: {
        id: true,
        provider: true,
        providerType: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        scopes: true,
        isVerified: true,
        isPrimary: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        profileData: true,
      },
    });

    if (!identity) {
      return c.json(
        ErrorResponseBuilder.notFound("External identity not found"),
        404
      );
    }

    return c.json({ identity });
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to fetch external identity",
        "FETCH_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

/**
 * PATCH /api/v1/users/external-identities/:id/primary
 * Set external identity as primary
 */
externalIdentities.patch("/:id/primary", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const identityId = c.req.param("id");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Verify identity belongs to user
    const identity = await prisma.externalIdentity.findFirst({
      where: {
        id: identityId,
        userId: user.id,
      },
    });

    if (!identity) {
      return c.json(
        ErrorResponseBuilder.notFound("External identity not found"),
        404
      );
    }

    // Unset all other identities as primary
    await prisma.externalIdentity.updateMany({
      where: {
        userId: user.id,
        isPrimary: true,
      },
      data: {
        isPrimary: false,
      },
    });

    // Set this identity as primary
    const updatedIdentity = await prisma.externalIdentity.update({
      where: { id: identityId },
      data: {
        isPrimary: true,
      },
    });

    // Log event
    await prisma.externalIdentityEvent.create({
      data: {
        userId: user.id,
        identityId,
        eventType: "SET_PRIMARY",
        success: true,
      },
    });

    return c.json({
      identity: updatedIdentity,
      message: "Primary identity updated",
    });
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to set primary identity",
        "UPDATE_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

/**
 * POST /api/v1/users/external-identities/:id/refresh
 * Refresh OAuth token for external identity
 */
externalIdentities.post("/:id/refresh", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const identityId = c.req.param("id");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Verify identity belongs to user
    const identity = await prisma.externalIdentity.findFirst({
      where: {
        id: identityId,
        userId: user.id,
      },
    });

    if (!identity) {
      return c.json(
        ErrorResponseBuilder.notFound("External identity not found"),
        404
      );
    }

    // Refresh token
    await OAuthService.refreshToken(identityId);

    return c.json({ message: "Token refreshed successfully" });
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to refresh token",
        "REFRESH_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

/**
 * DELETE /api/v1/users/external-identities/:id
 * Unlink external identity
 */
externalIdentities.delete("/:id", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const identityId = c.req.param("id");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Verify identity belongs to user
    const identity = await prisma.externalIdentity.findFirst({
      where: {
        id: identityId,
        userId: user.id,
      },
    });

    if (!identity) {
      return c.json(
        ErrorResponseBuilder.notFound("External identity not found"),
        404
      );
    }

    // Check if user has password or other identities
    const userWithIdentities = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        externalIdentities: true,
      },
    });

    if (
      !userWithIdentities?.password &&
      userWithIdentities?.externalIdentities.length === 1
    ) {
      return c.json(
        ErrorResponseBuilder.validation(
          "Cannot unlink last authentication method",
          [
            {
              field: "identity",
              message:
                "You must have a password or another linked account before unlinking this identity",
            },
          ]
        ),
        400
      );
    }

    // Revoke and delete identity
    await OAuthService.revokeIdentity(identityId);

    // Log audit
    await AuditLogger.log({
      action: "PERMISSION_REVOKED",
      severity: "MEDIUM",
      actorId: user.id,
      actorType: "user",
      targetId: identityId,
      targetType: "external_identity",
      organizationId: userWithIdentities?.organizationId,
      status: "success",
      metadata: { provider: identity.provider },
    });

    return c.json({ message: "External identity unlinked successfully" });
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to unlink external identity",
        "DELETE_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

/**
 * GET /api/v1/users/external-identities/:id/events
 * Get events for an external identity
 */
externalIdentities.get("/:id/events", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const identityId = c.req.param("id");

    if (!user || !user.id) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Verify identity belongs to user
    const identity = await prisma.externalIdentity.findFirst({
      where: {
        id: identityId,
        userId: user.id,
      },
    });

    if (!identity) {
      return c.json(
        ErrorResponseBuilder.notFound("External identity not found"),
        404
      );
    }

    const events = await prisma.externalIdentityEvent.findMany({
      where: { identityId },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return c.json({ events });
  } catch (error: any) {
    return c.json(
      ErrorResponseBuilder.system(
        "Failed to fetch identity events",
        "FETCH_FAILED",
        { error: error.message }
      ),
      500
    );
  }
});

export default externalIdentities;
