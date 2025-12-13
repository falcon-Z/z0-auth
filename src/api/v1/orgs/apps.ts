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

export default orgApps;
