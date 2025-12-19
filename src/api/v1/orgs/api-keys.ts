import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import {
    Logger,
    DatabaseErrorHandler,
    ErrorResponseBuilder,
    RequestContext
} from "@z0/utils/error-handling";
import { z } from "zod";
import { validator } from "hono/validator";
import { verifyAccessTokenMiddleware, type TokenPayload } from "@z0/utils/auth";
import { requireOrgAccess } from "./middleware";
import { randomBytes } from "crypto";

const apiKeys = new Hono();

// Schema for creating an API key
const createKeySchema = z.object({
    name: z.string().min(1).max(100),
    expiresIn: z.number().int().positive().optional(), // Days until expiration
});

// Schema for updating an API key
const updateKeySchema = z.object({
    name: z.string().min(1).max(100).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

// Helper: Generate API Key
function generateApiKey(): string {
    const random = randomBytes(24).toString('base64').replace(/\+/g, '0').replace(/\//g, '1').replace(/=/g, '');
    return `z0_${random}`;
}

// Helper: Generate API Secret
function generateApiSecret(): string {
    const random = randomBytes(32).toString('base64').replace(/\+/g, '0').replace(/\//g, '1').replace(/=/g, '');
    return `z0s_${random}`;
}

/**
 * GET /api/v1/orgs/:orgId/apps/:appId/keys
 * List all API keys for an app
 */
apiKeys.get("/:orgId/apps/:appId/keys", verifyAccessTokenMiddleware, requireOrgAccess, async (c) => {
    const orgId = c.req.param("orgId");
    const appId = c.req.param("appId");
    const requestId = RequestContext.generateRequestId();

    try {
        // Verify app belongs to org
        const app = await db.app.findFirst({
            where: { id: appId, organizationId: orgId }
        });

        if (!app) {
            return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
        }

        const keys = await db.apiKey.findMany({
            where: { appId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                keyPrefix: true,
                status: true,
                expiresAt: true,
                lastUsedAt: true,
                createdAt: true,
                gracePeriodEnd: true,
            }
        });

        return c.json({
            success: true,
            data: keys,
            requestId
        });
    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to list API keys", "DB_ERROR"), 500);
    }
});

/**
 * POST /api/v1/orgs/:orgId/apps/:appId/keys
 * Create a new API key
 */
apiKeys.post("/:orgId/apps/:appId/keys",
    verifyAccessTokenMiddleware,
    requireOrgAccess,
    validator("json", (value, c) => {
        const parsed = createKeySchema.safeParse(value);
        if (!parsed.success) {
            const issues = parsed.error.issues.map(i => ({
                field: i.path.join('.'),
                message: i.message,
                code: i.code
            }));
            return c.json(ErrorResponseBuilder.validation("Invalid data", issues), 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const orgId = c.req.param("orgId");
        const appId = c.req.param("appId");
        const data = c.req.valid("json");
        const currentUser = c.get('user') as TokenPayload;
        const requestId = RequestContext.generateRequestId();

        try {
            // Verify app belongs to org
            const app = await db.app.findFirst({
                where: { id: appId, organizationId: orgId }
            });

            if (!app) {
                return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
            }

            const apiKey = generateApiKey();
            const apiSecret = generateApiSecret();
            const keyPrefix = apiKey.substring(0, 10);

            const expiresAt = data.expiresIn
                ? new Date(Date.now() + data.expiresIn * 24 * 60 * 60 * 1000)
                : null;

            const newKey = await db.apiKey.create({
                data: {
                    appId,
                    name: data.name,
                    key: apiKey,
                    secret: apiSecret,
                    keyPrefix,
                    status: "ACTIVE",
                    expiresAt,
                }
            });

            Logger.info("API key created", {
                keyId: newKey.id,
                appId,
                orgId,
                createdBy: currentUser.userId,
                requestId
            });

            return c.json({
                success: true,
                message: "API key created successfully. Please save the secret - it won't be shown again.",
                data: {
                    id: newKey.id,
                    name: newKey.name,
                    key: apiKey,
                    secret: apiSecret,
                    keyPrefix: newKey.keyPrefix,
                    expiresAt: newKey.expiresAt,
                    createdAt: newKey.createdAt,
                },
                requestId
            }, 201);
        } catch (error) {
            const dbError = DatabaseErrorHandler.handleError(error);
            return c.json(ErrorResponseBuilder.database("Failed to create API key", dbError.code), 500);
        }
    }
);

/**
 * POST /api/v1/orgs/:orgId/apps/:appId/keys/:keyId/rotate
 * Rotate an API key (creates new key with grace period for old)
 */
apiKeys.post("/:orgId/apps/:appId/keys/:keyId/rotate",
    verifyAccessTokenMiddleware,
    requireOrgAccess,
    async (c) => {
        const orgId = c.req.param("orgId");
        const appId = c.req.param("appId");
        const keyId = c.req.param("keyId");
        const currentUser = c.get('user') as TokenPayload;
        const requestId = RequestContext.generateRequestId();

        try {
            // Verify app belongs to org
            const app = await db.app.findFirst({
                where: { id: appId, organizationId: orgId }
            });

            if (!app) {
                return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
            }

            const existingKey = await db.apiKey.findFirst({
                where: { id: keyId, appId }
            });

            if (!existingKey) {
                return c.json(ErrorResponseBuilder.notFound("API key not found"), 404);
            }

            // Generate new key
            const newApiKey = generateApiKey();
            const newApiSecret = generateApiSecret();
            const keyPrefix = newApiKey.substring(0, 10);

            // Set grace period for old key (24 hours)
            const gracePeriodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);

            // Create new key and update old key in transaction
            const [updatedOldKey, newKey] = await db.$transaction([
                db.apiKey.update({
                    where: { id: keyId },
                    data: {
                        status: "ROTATING",
                        gracePeriodEnd
                    }
                }),
                db.apiKey.create({
                    data: {
                        appId,
                        name: `${existingKey.name} (rotated)`,
                        key: newApiKey,
                        secret: newApiSecret,
                        keyPrefix,
                        status: "ACTIVE",
                        expiresAt: existingKey.expiresAt,
                    }
                })
            ]);

            Logger.info("API key rotated", {
                oldKeyId: keyId,
                newKeyId: newKey.id,
                appId,
                orgId,
                rotatedBy: currentUser.userId,
                gracePeriodEnd,
                requestId
            });

            return c.json({
                success: true,
                message: "API key rotated successfully. Old key will remain valid for 24 hours.",
                data: {
                    newKey: {
                        id: newKey.id,
                        name: newKey.name,
                        key: newApiKey,
                        secret: newApiSecret,
                        keyPrefix: newKey.keyPrefix,
                    },
                    oldKey: {
                        id: updatedOldKey.id,
                        status: updatedOldKey.status,
                        gracePeriodEnd: updatedOldKey.gracePeriodEnd,
                    }
                },
                requestId
            });
        } catch (error) {
            return c.json(ErrorResponseBuilder.system("Failed to rotate API key", "DB_ERROR"), 500);
        }
    }
);

/**
 * PATCH /api/v1/orgs/:orgId/apps/:appId/keys/:keyId
 * Update API key name or status
 */
apiKeys.patch("/:orgId/apps/:appId/keys/:keyId",
    verifyAccessTokenMiddleware,
    requireOrgAccess,
    validator("json", (value, c) => {
        const parsed = updateKeySchema.safeParse(value);
        if (!parsed.success) {
            const issues = parsed.error.issues.map(i => ({
                field: i.path.join('.'),
                message: i.message,
                code: i.code
            }));
            return c.json(ErrorResponseBuilder.validation("Invalid data", issues), 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const orgId = c.req.param("orgId");
        const appId = c.req.param("appId");
        const keyId = c.req.param("keyId");
        const data = c.req.valid("json");
        const currentUser = c.get('user') as TokenPayload;
        const requestId = RequestContext.generateRequestId();

        try {
            // Verify app belongs to org
            const app = await db.app.findFirst({
                where: { id: appId, organizationId: orgId }
            });

            if (!app) {
                return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
            }

            const existingKey = await db.apiKey.findFirst({
                where: { id: keyId, appId }
            });

            if (!existingKey) {
                return c.json(ErrorResponseBuilder.notFound("API key not found"), 404);
            }

            const updatedKey = await db.apiKey.update({
                where: { id: keyId },
                data: {
                    ...(data.name && { name: data.name }),
                    ...(data.status && { status: data.status }),
                },
                select: {
                    id: true,
                    name: true,
                    keyPrefix: true,
                    status: true,
                    expiresAt: true,
                    lastUsedAt: true,
                }
            });

            Logger.info("API key updated", {
                keyId,
                appId,
                orgId,
                updatedBy: currentUser.userId,
                requestId
            });

            return c.json({
                success: true,
                message: "API key updated successfully",
                data: updatedKey,
                requestId
            });
        } catch (error) {
            return c.json(ErrorResponseBuilder.system("Failed to update API key", "DB_ERROR"), 500);
        }
    }
);

/**
 * DELETE /api/v1/orgs/:orgId/apps/:appId/keys/:keyId
 * Revoke an API key
 */
apiKeys.delete("/:orgId/apps/:appId/keys/:keyId",
    verifyAccessTokenMiddleware,
    requireOrgAccess,
    async (c) => {
        const orgId = c.req.param("orgId");
        const appId = c.req.param("appId");
        const keyId = c.req.param("keyId");
        const currentUser = c.get('user') as TokenPayload;
        const requestId = RequestContext.generateRequestId();

        try {
            // Verify app belongs to org
            const app = await db.app.findFirst({
                where: { id: appId, organizationId: orgId }
            });

            if (!app) {
                return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
            }

            const existingKey = await db.apiKey.findFirst({
                where: { id: keyId, appId }
            });

            if (!existingKey) {
                return c.json(ErrorResponseBuilder.notFound("API key not found"), 404);
            }

            await db.apiKey.update({
                where: { id: keyId },
                data: { status: "REVOKED" }
            });

            Logger.info("API key revoked", {
                keyId,
                appId,
                orgId,
                revokedBy: currentUser.userId,
                requestId
            });

            return c.json({
                success: true,
                message: "API key revoked successfully",
                requestId
            });
        } catch (error) {
            return c.json(ErrorResponseBuilder.system("Failed to revoke API key", "DB_ERROR"), 500);
        }
    }
);

export default apiKeys;
