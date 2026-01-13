/**
 * User Self-Service API Keys
 *
 * Allows users to create and manage their own API keys for apps they have access to.
 * Keys are scoped to specific apps and inherit the user's permissions.
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
import { randomBytes, createHash } from "crypto";

const userApiKeys = new Hono();

/**
 * Generate a user API key with prefix
 */
function generateUserApiKey(): string {
  const random = randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "0")
    .replace(/\//g, "1")
    .replace(/=/g, "");
  return `z0u_${random}`;
}

/**
 * Hash an API key for storage
 */
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Schema for creating a user API key
 */
const createKeySchema = z.object({
  appId: z.string().cuid(),
  name: z.string().min(1).max(100),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * Schema for updating a user API key
 */
const updateKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * GET /api/v1/users/me/api-keys
 * List all API keys for the current user
 */
userApiKeys.get("/me/api-keys", verifyAccessTokenMiddleware, async (c) => {
  const user = c.get("user") as TokenPayload;
  const requestId = RequestContext.generateRequestId();

  try {
    const keys = await db.userApiKey.findMany({
      where: {
        userId: user.userId,
        status: { not: "REVOKED" },
      },
      include: {
        app: {
          select: {
            id: true,
            name: true,
            slug: true,
            organization: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform for response (hide sensitive data)
    const data = keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      status: key.status,
      app: key.app,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      usageCount: key.usageCount,
      createdAt: key.createdAt,
    }));

    return c.json({
      success: true,
      data,
      total: data.length,
      requestId,
    });
  } catch (error) {
    Logger.error("Failed to list user API keys", { userId: user.userId, error });
    return c.json(
      ErrorResponseBuilder.system("Failed to list API keys", "DB_ERROR"),
      500
    );
  }
});

/**
 * GET /api/v1/users/me/api-keys/:keyId
 * Get specific API key details
 */
userApiKeys.get(
  "/me/api-keys/:keyId",
  verifyAccessTokenMiddleware,
  async (c) => {
    const user = c.get("user") as TokenPayload;
    const keyId = c.req.param("keyId");
    const requestId = RequestContext.generateRequestId();

    try {
      const key = await db.userApiKey.findFirst({
        where: {
          id: keyId,
          userId: user.userId,
        },
        include: {
          app: {
            select: {
              id: true,
              name: true,
              slug: true,
              organization: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
      });

      if (!key) {
        return c.json(ErrorResponseBuilder.notFound("API key not found"), 404);
      }

      return c.json({
        success: true,
        data: {
          id: key.id,
          name: key.name,
          keyPrefix: key.keyPrefix,
          status: key.status,
          app: key.app,
          expiresAt: key.expiresAt,
          lastUsedAt: key.lastUsedAt,
          usageCount: key.usageCount,
          rateLimit: key.rateLimit,
          metadata: key.metadata,
          createdAt: key.createdAt,
          updatedAt: key.updatedAt,
        },
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to fetch user API key", { keyId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to fetch API key", "DB_ERROR"),
        500
      );
    }
  }
);

/**
 * POST /api/v1/users/me/api-keys
 * Create a new API key for an app the user has access to
 */
userApiKeys.post(
  "/me/api-keys",
  verifyAccessTokenMiddleware,
  validator("json", (value, c) => {
    const parsed = createKeySchema.safeParse(value);
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
    const user = c.get("user") as TokenPayload;
    const data = c.req.valid("json");
    const requestId = RequestContext.generateRequestId();

    try {
      // Verify user has access to the app
      const appMembership = await db.appMembership.findUnique({
        where: {
          userId_appId: {
            userId: user.userId,
            appId: data.appId,
          },
        },
        include: {
          app: {
            select: {
              id: true,
              name: true,
              status: true,
              organizationId: true,
            },
          },
        },
      });

      if (!appMembership || !appMembership.isActive) {
        return c.json(
          ErrorResponseBuilder.authorization(
            "You do not have access to this app"
          ),
          403
        );
      }

      if (appMembership.app.status !== "ACTIVE") {
        return c.json(
          ErrorResponseBuilder.validation("Cannot create API key for inactive app", []),
          400
        );
      }

      // Check for duplicate name
      const existingKey = await db.userApiKey.findFirst({
        where: {
          userId: user.userId,
          appId: data.appId,
          name: data.name,
          status: { not: "REVOKED" },
        },
      });

      if (existingKey) {
        return c.json(
          ErrorResponseBuilder.conflict(
            "An API key with this name already exists for this app"
          ),
          409
        );
      }

      // Generate key
      const apiKey = generateUserApiKey();
      const keyPrefix = apiKey.substring(0, 12);
      const keyHash = hashApiKey(apiKey);

      const expiresAt = data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const newKey = await db.userApiKey.create({
        data: {
          userId: user.userId,
          appId: data.appId,
          name: data.name,
          keyPrefix,
          keyHash,
          expiresAt,
          metadata: data.metadata,
        },
      });

      Logger.info("User API key created", {
        keyId: newKey.id,
        userId: user.userId,
        appId: data.appId,
        requestId,
      });

      // Return the full key only once
      return c.json(
        {
          success: true,
          message:
            "API key created successfully. Please save this key - it won't be shown again.",
          data: {
            id: newKey.id,
            name: newKey.name,
            key: apiKey, // Only shown once!
            keyPrefix: newKey.keyPrefix,
            appId: data.appId,
            appName: appMembership.app.name,
            expiresAt: newKey.expiresAt,
            createdAt: newKey.createdAt,
          },
          requestId,
        },
        201
      );
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error("Failed to create user API key", {
        userId: user.userId,
        appId: data.appId,
        error: dbError.message,
      });
      return c.json(
        ErrorResponseBuilder.database("Failed to create API key", dbError.code),
        500
      );
    }
  }
);

/**
 * PATCH /api/v1/users/me/api-keys/:keyId
 * Update an API key (name/metadata only)
 */
userApiKeys.patch(
  "/me/api-keys/:keyId",
  verifyAccessTokenMiddleware,
  validator("json", (value, c) => {
    const parsed = updateKeySchema.safeParse(value);
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
    const user = c.get("user") as TokenPayload;
    const keyId = c.req.param("keyId");
    const data = c.req.valid("json");
    const requestId = RequestContext.generateRequestId();

    try {
      const existingKey = await db.userApiKey.findFirst({
        where: {
          id: keyId,
          userId: user.userId,
        },
      });

      if (!existingKey) {
        return c.json(ErrorResponseBuilder.notFound("API key not found"), 404);
      }

      if (existingKey.status === "REVOKED") {
        return c.json(
          ErrorResponseBuilder.validation("Cannot update a revoked API key", []),
          400
        );
      }

      // Check for duplicate name if changing name
      if (data.name && data.name !== existingKey.name) {
        const duplicateName = await db.userApiKey.findFirst({
          where: {
            userId: user.userId,
            appId: existingKey.appId,
            name: data.name,
            status: { not: "REVOKED" },
            id: { not: keyId },
          },
        });

        if (duplicateName) {
          return c.json(
            ErrorResponseBuilder.conflict(
              "An API key with this name already exists for this app"
            ),
            409
          );
        }
      }

      const updated = await db.userApiKey.update({
        where: { id: keyId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.metadata !== undefined && { metadata: data.metadata }),
        },
      });

      Logger.info("User API key updated", {
        keyId,
        userId: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "API key updated successfully",
        data: {
          id: updated.id,
          name: updated.name,
          keyPrefix: updated.keyPrefix,
          metadata: updated.metadata,
          updatedAt: updated.updatedAt,
        },
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to update user API key", { keyId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to update API key", "DB_ERROR"),
        500
      );
    }
  }
);

/**
 * DELETE /api/v1/users/me/api-keys/:keyId
 * Revoke an API key
 */
userApiKeys.delete(
  "/me/api-keys/:keyId",
  verifyAccessTokenMiddleware,
  async (c) => {
    const user = c.get("user") as TokenPayload;
    const keyId = c.req.param("keyId");
    const requestId = RequestContext.generateRequestId();

    try {
      const existingKey = await db.userApiKey.findFirst({
        where: {
          id: keyId,
          userId: user.userId,
        },
      });

      if (!existingKey) {
        return c.json(ErrorResponseBuilder.notFound("API key not found"), 404);
      }

      if (existingKey.status === "REVOKED") {
        return c.json(
          ErrorResponseBuilder.conflict("API key is already revoked"),
          409
        );
      }

      await db.userApiKey.update({
        where: { id: keyId },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revokedBy: user.userId,
        },
      });

      Logger.info("User API key revoked", {
        keyId,
        userId: user.userId,
        requestId,
      });

      return c.json({
        success: true,
        message: "API key revoked successfully",
        requestId,
      });
    } catch (error) {
      Logger.error("Failed to revoke user API key", { keyId, error });
      return c.json(
        ErrorResponseBuilder.system("Failed to revoke API key", "DB_ERROR"),
        500
      );
    }
  }
);

/**
 * GET /api/v1/users/me/apps
 * List apps the user has access to (for API key creation)
 */
userApiKeys.get("/me/apps", verifyAccessTokenMiddleware, async (c) => {
  const user = c.get("user") as TokenPayload;
  const requestId = RequestContext.generateRequestId();

  try {
    const memberships = await db.appMembership.findMany({
      where: {
        userId: user.userId,
        isActive: true,
        app: { status: "ACTIVE" },
      },
      include: {
        app: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            organization: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const apps = memberships.map((m) => ({
      ...m.app,
      roleType: m.roleType,
      joinedAt: m.joinedAt,
    }));

    return c.json({
      success: true,
      data: apps,
      total: apps.length,
      requestId,
    });
  } catch (error) {
    Logger.error("Failed to list user apps", { userId: user.userId, error });
    return c.json(
      ErrorResponseBuilder.system("Failed to list apps", "DB_ERROR"),
      500
    );
  }
});

export default userApiKeys;
