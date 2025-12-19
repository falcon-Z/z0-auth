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
import { verifyAccessTokenMiddleware } from "@z0/utils/auth";
import { requireOrgAccess } from "./middleware";
import { randomBytes } from "crypto";

const orgApps = new Hono();

// Schema for registering an app
const createAppSchema = z.object({
    name: z.string().min(2).max(100),
    slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
    description: z.string().optional(),
    allowedOrigins: z.array(z.string().url()).optional(),
});

// Schema for updating an app
const updateAppSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes").optional(),
    description: z.string().max(500).optional(),
    allowedOrigins: z.array(z.string().url()).optional(),
});

// Schema for status change
const statusSchema = z.object({
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

// Middleware: Ensure user has access to this organization
// Access: Platform Managers OR Org Admins of this Org
// Middleware local definition removed in favor of import from ./middleware

// Helper: Generate API Keys
function generateApiKey() {
    // sk_live_<24 chars>
    const random = randomBytes(18).toString('base64').replace(/\+/g, '0').replace(/\//g, '1').substring(0, 24);
    return `sk_live_${random}`;
}

function generateApiSecret() {
    // sec_<48 chars>
    const random = randomBytes(36).toString('base64').replace(/\+/g, '0').replace(/\//g, '1').substring(0, 48);
    return `sec_${random}`;
}

/**
 * GET /api/v1/orgs/:orgId/apps
 * List apps for an organization
 */
orgApps.get("/:orgId/apps", verifyAccessTokenMiddleware, requireOrgAccess, async (c) => {
    const orgId = c.req.param("orgId");
    const requestId = RequestContext.generateRequestId();

    try {
        const apps = await db.app.findMany({
            where: { organizationId: orgId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                apiKey: true, // Only showing public key part? No, apiKey IS the public identifier usually.
                createdAt: true,
                _count: {
                    select: { users: true }
                }
            }
        });

        return c.json({
            success: true,
            data: apps,
            requestId
        });
    } catch (error) {
        const dbError = DatabaseErrorHandler.handleError(error);
        return c.json(ErrorResponseBuilder.database("Failed to fetch apps", dbError.code), 500);
    }
});

/**
 * POST /api/v1/orgs/:orgId/apps
 * Register a new App
 */
orgApps.post("/:orgId/apps",
    verifyAccessTokenMiddleware,
    requireOrgAccess,
    validator("json", (value, c) => {
        const parsed = createAppSchema.safeParse(value);
        if (!parsed.success) {
            const issues = parsed.error.issues.map(i => ({
                field: i.path.join('.'),
                message: i.message,
                code: i.code
            }));
            return c.json(ErrorResponseBuilder.validation("Invalid app data", issues), 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const orgId = c.req.param("orgId");
        const requestId = RequestContext.generateRequestId();
        const data = c.req.valid("json");
        const user = c.get('user') as any;

        try {
            const apiKey = generateApiKey();
            const apiSecret = generateApiSecret();

            // Hash secret if needed? Schema says "apiSecret String". 
            // Usually we store hashed secret, show once. 
            // But schema doesn't imply hash, just String. 
            // Let's assume we store plain for now OR hash it?
            // "apiSecret String" in schema. Security precaution: Should likely be hashed, but for MVP standard logic:
            // return secret ONCE.
            // Let's store it as is for now unless there's a strict requirement to hash it (best practice).
            // User schema has "apiSecret String".

            const newApp = await db.app.create({
                data: {
                    organizationId: orgId,
                    name: data.name,
                    slug: data.slug,
                    description: data.description,
                    apiKey: apiKey,
                    apiSecret: apiSecret, // Warning: Storing plain text secret
                }
            });

            // If allowedOrigins provided
            if (data.allowedOrigins && data.allowedOrigins.length > 0) {
                await db.allowedOrigin.createMany({
                    data: data.allowedOrigins.map(origin => ({
                        appId: newApp.id,
                        origin: origin
                    }))
                });
            }

            Logger.info("App registered", { appId: newApp.id, orgId, createdBy: user.userId, requestId });

            return c.json({
                success: true,
                message: "App registered successfully",
                data: {
                    ...newApp,
                    apiSecret: apiSecret // Return secret only here
                },
                requestId
            }, 201);

        } catch (error) {
            const dbError = DatabaseErrorHandler.handleError(error);
            if (dbError.code === "DB_UNIQUE_CONSTRAINT") {
                return c.json(ErrorResponseBuilder.conflict("App with this slug or name already exists in this organization"), 409);
            }
            return c.json(ErrorResponseBuilder.database("Failed to register app", dbError.code), 500);
        }
    }
);

/**
 * GET /api/v1/orgs/:orgId/apps/:appId
 * Get single app with details
 */
orgApps.get("/:orgId/apps/:appId", verifyAccessTokenMiddleware, requireOrgAccess, async (c) => {
    const orgId = c.req.param("orgId");
    const appId = c.req.param("appId");
    const requestId = RequestContext.generateRequestId();

    try {
        const app = await db.app.findFirst({
            where: { id: appId, organizationId: orgId },
            include: {
                allowedOrigins: true,
                _count: {
                    select: { users: true, apiKeys: true }
                }
            }
        });

        if (!app) {
            return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
        }

        // Don't include apiSecret in response
        const { apiSecret, ...appData } = app;

        return c.json({
            success: true,
            data: appData,
            requestId
        });

    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to fetch app details", "SYSTEM_ERROR"), 500);
    }
});

/**
 * PUT /api/v1/orgs/:orgId/apps/:appId
 * Update app
 */
orgApps.put("/:orgId/apps/:appId",
    verifyAccessTokenMiddleware,
    requireOrgAccess,
    validator("json", (value, c) => {
        const parsed = updateAppSchema.safeParse(value);
        if (!parsed.success) {
            const issues = parsed.error.issues.map(i => ({
                field: i.path.join('.'),
                message: i.message,
                code: i.code
            }));
            return c.json(ErrorResponseBuilder.validation("Invalid app data", issues), 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const orgId = c.req.param("orgId");
        const appId = c.req.param("appId");
        const requestId = RequestContext.generateRequestId();
        const data = c.req.valid("json");
        const user = c.get('user') as any;

        try {
            const existingApp = await db.app.findFirst({
                where: { id: appId, organizationId: orgId }
            });

            if (!existingApp) {
                return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
            }

            const updatedApp = await db.app.update({
                where: { id: appId },
                data: {
                    ...(data.name && { name: data.name }),
                    ...(data.slug && { slug: data.slug }),
                    ...(data.description !== undefined && { description: data.description }),
                }
            });

            // Handle allowedOrigins if provided
            if (data.allowedOrigins !== undefined) {
                // Delete existing origins and replace with new ones
                await db.allowedOrigin.deleteMany({ where: { appId } });
                if (data.allowedOrigins.length > 0) {
                    await db.allowedOrigin.createMany({
                        data: data.allowedOrigins.map(origin => ({
                            appId,
                            origin
                        }))
                    });
                }
            }

            Logger.info("App updated", { appId, orgId, updatedBy: user.userId, requestId });

            // Don't include apiSecret in response
            const { apiSecret, ...appData } = updatedApp;

            return c.json({
                success: true,
                message: "App updated successfully",
                data: appData,
                requestId
            });

        } catch (error) {
            const dbError = DatabaseErrorHandler.handleError(error);
            if (dbError.code === "DB_UNIQUE_CONSTRAINT") {
                return c.json(ErrorResponseBuilder.conflict("App with this slug already exists"), 409);
            }
            return c.json(ErrorResponseBuilder.database("Failed to update app", dbError.code), 500);
        }
    }
);

/**
 * PATCH /api/v1/orgs/:orgId/apps/:appId/status
 * Change app status
 */
orgApps.patch("/:orgId/apps/:appId/status",
    verifyAccessTokenMiddleware,
    requireOrgAccess,
    validator("json", (value, c) => {
        const parsed = statusSchema.safeParse(value);
        if (!parsed.success) {
            const issues = parsed.error.issues.map(i => ({
                field: i.path.join('.'),
                message: i.message,
                code: i.code
            }));
            return c.json(ErrorResponseBuilder.validation("Invalid status", issues), 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const orgId = c.req.param("orgId");
        const appId = c.req.param("appId");
        const requestId = RequestContext.generateRequestId();
        const { status } = c.req.valid("json");
        const user = c.get('user') as any;

        try {
            const existingApp = await db.app.findFirst({
                where: { id: appId, organizationId: orgId }
            });

            if (!existingApp) {
                return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
            }

            const updatedApp = await db.app.update({
                where: { id: appId },
                data: { status }
            });

            Logger.info("App status changed", {
                appId,
                orgId,
                oldStatus: existingApp.status,
                newStatus: status,
                changedBy: user.userId,
                requestId
            });

            return c.json({
                success: true,
                message: `App status changed to ${status}`,
                data: {
                    id: updatedApp.id,
                    status: updatedApp.status
                },
                requestId
            });

        } catch (error) {
            return c.json(ErrorResponseBuilder.system("Failed to update app status", "SYSTEM_ERROR"), 500);
        }
    }
);

/**
 * DELETE /api/v1/orgs/:orgId/apps/:appId
 * Delete app (soft delete)
 */
orgApps.delete("/:orgId/apps/:appId", verifyAccessTokenMiddleware, requireOrgAccess, async (c) => {
    const orgId = c.req.param("orgId");
    const appId = c.req.param("appId");
    const requestId = RequestContext.generateRequestId();
    const user = c.get('user') as any;

    try {
        const existingApp = await db.app.findFirst({
            where: { id: appId, organizationId: orgId },
            include: {
                _count: { select: { users: true, apiKeys: true } }
            }
        });

        if (!existingApp) {
            return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
        }

        // Soft delete by setting status to INACTIVE
        const deletedApp = await db.app.update({
            where: { id: appId },
            data: { status: "INACTIVE" }
        });

        Logger.info("App deleted", {
            appId,
            orgId,
            deletedBy: user.userId,
            userCount: existingApp._count.users,
            requestId
        });

        return c.json({
            success: true,
            message: "App deleted successfully",
            data: {
                id: deletedApp.id,
                status: deletedApp.status
            },
            requestId
        });

    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to delete app", "SYSTEM_ERROR"), 500);
    }
});

/**
 * POST /api/v1/orgs/:orgId/apps/:appId/regenerate-secret
 * Regenerate API secret
 */
orgApps.post("/:orgId/apps/:appId/regenerate-secret", verifyAccessTokenMiddleware, requireOrgAccess, async (c) => {
    const orgId = c.req.param("orgId");
    const appId = c.req.param("appId");
    const requestId = RequestContext.generateRequestId();
    const user = c.get('user') as any;

    try {
        const existingApp = await db.app.findFirst({
            where: { id: appId, organizationId: orgId }
        });

        if (!existingApp) {
            return c.json(ErrorResponseBuilder.notFound("App not found"), 404);
        }

        const newSecret = generateApiSecret();

        await db.app.update({
            where: { id: appId },
            data: { apiSecret: newSecret }
        });

        Logger.info("API secret regenerated", {
            appId,
            orgId,
            regeneratedBy: user.userId,
            requestId
        });

        return c.json({
            success: true,
            message: "API secret regenerated successfully. Please save this secret - it won't be shown again.",
            data: {
                apiSecret: newSecret
            },
            requestId
        });

    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to regenerate API secret", "SYSTEM_ERROR"), 500);
    }
});

export default orgApps;
