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
import { requirePlatformManager } from "./middleware";

const platformOrgs = new Hono();

// Schema for creating an organization
const createOrgSchema = z.object({
    name: z.string().min(2).max(100),
    slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
    description: z.string().optional(),
});

// Schema for updating an organization
const updateOrgSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes").optional(),
    description: z.string().max(500).optional(),
    maxUsers: z.number().int().positive().optional(),
    maxApps: z.number().int().positive().optional(),
});

// Schema for status change
const statusSchema = z.object({
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
});

// Local definition removed in favor of import from ./middleware


/**
 * GET /api/v1/platform/organizations
 * List all organizations
 */
platformOrgs.get("/", verifyAccessTokenMiddleware, requirePlatformManager, async (c) => {
    const requestId = RequestContext.generateRequestId();
    try {
        const orgs = await db.organization.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { users: true, apps: true }
                }
            }
        });

        return c.json({
            success: true,
            data: orgs,
            requestId
        });
    } catch (error) {
        const dbError = DatabaseErrorHandler.handleError(error);
        return c.json(ErrorResponseBuilder.database("Failed to fetch organizations", dbError.code), 500);
    }
});

/**
 * POST /api/v1/platform/organizations
 * Create a new organization
 */
platformOrgs.post("/",
    verifyAccessTokenMiddleware,
    requirePlatformManager,
    validator("json", (value, c) => {
        const parsed = createOrgSchema.safeParse(value);
        if (!parsed.success) {
            const issues = parsed.error.issues.map(i => ({
                field: i.path.join('.'),
                message: i.message,
                code: i.code
            }));
            return c.json(ErrorResponseBuilder.validation("Invalid organization data", issues), 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const requestId = RequestContext.generateRequestId();
        const data = c.req.valid("json");
        const user = c.get('user') as any;

        try {
            const newOrg = await db.organization.create({
                data: {
                    name: data.name,
                    slug: data.slug,
                    description: data.description,
                    // Optionally link creator if needed, but schema doesn't force a creator link on Org itself (only via OrgAdmin)
                }
            });

            Logger.info("Organization created", { orgId: newOrg.id, createdBy: user.userId, requestId });

            return c.json({
                success: true,
                message: "Organization created successfully",
                data: newOrg,
                requestId
            }, 201);

        } catch (error) {
            const dbError = DatabaseErrorHandler.handleError(error);
            // handle unique slug error
            if (dbError.code === "DB_UNIQUE_CONSTRAINT") {
                return c.json(ErrorResponseBuilder.conflict("Organization with this slug already exists"), 409);
            }
            return c.json(ErrorResponseBuilder.database("Failed to create organization", dbError.code), 500);
        }
    }
);

/**
 * GET /api/v1/platform/organizations/:id
 * Get organization details
 */
platformOrgs.get("/:id", verifyAccessTokenMiddleware, requirePlatformManager, async (c) => {
    const id = c.req.param("id");
    const requestId = RequestContext.generateRequestId();

    try {
        const org = await db.organization.findUnique({
            where: { id },
            include: {
                users: { take: 5 }, // Preview
                apps: true,
                orgAdmins: { include: { user: { select: { id: true, name: true, email: true } } } }
            }
        });

        if (!org) {
            return c.json(ErrorResponseBuilder.notFound("Organization not found"), 404);
        }

        return c.json({
            success: true,
            data: org,
            requestId
        });

    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to fetch organization details", "SYSTEM_ERROR"), 500);
    }
});

/**
 * PUT /api/v1/platform/organizations/:id
 * Update organization
 */
platformOrgs.put("/:id",
    verifyAccessTokenMiddleware,
    requirePlatformManager,
    validator("json", (value, c) => {
        const parsed = updateOrgSchema.safeParse(value);
        if (!parsed.success) {
            const issues = parsed.error.issues.map(i => ({
                field: i.path.join('.'),
                message: i.message,
                code: i.code
            }));
            return c.json(ErrorResponseBuilder.validation("Invalid organization data", issues), 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const id = c.req.param("id");
        const requestId = RequestContext.generateRequestId();
        const data = c.req.valid("json");
        const user = c.get('user') as any;

        try {
            // Check if org exists
            const existingOrg = await db.organization.findUnique({ where: { id } });
            if (!existingOrg) {
                return c.json(ErrorResponseBuilder.notFound("Organization not found"), 404);
            }

            const updatedOrg = await db.organization.update({
                where: { id },
                data: {
                    ...(data.name && { name: data.name }),
                    ...(data.slug && { slug: data.slug }),
                    ...(data.description !== undefined && { description: data.description }),
                    ...(data.maxUsers && { maxUsers: data.maxUsers }),
                    ...(data.maxApps && { maxApps: data.maxApps }),
                }
            });

            Logger.info("Organization updated", { orgId: id, updatedBy: user.userId, requestId });

            return c.json({
                success: true,
                message: "Organization updated successfully",
                data: updatedOrg,
                requestId
            });

        } catch (error) {
            const dbError = DatabaseErrorHandler.handleError(error);
            if (dbError.code === "DB_UNIQUE_CONSTRAINT") {
                return c.json(ErrorResponseBuilder.conflict("Organization with this slug already exists"), 409);
            }
            return c.json(ErrorResponseBuilder.database("Failed to update organization", dbError.code), 500);
        }
    }
);

/**
 * PATCH /api/v1/platform/organizations/:id/status
 * Change organization status
 */
platformOrgs.patch("/:id/status",
    verifyAccessTokenMiddleware,
    requirePlatformManager,
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
        const id = c.req.param("id");
        const requestId = RequestContext.generateRequestId();
        const { status } = c.req.valid("json");
        const user = c.get('user') as any;

        try {
            const existingOrg = await db.organization.findUnique({ where: { id } });
            if (!existingOrg) {
                return c.json(ErrorResponseBuilder.notFound("Organization not found"), 404);
            }

            const updatedOrg = await db.organization.update({
                where: { id },
                data: { status }
            });

            Logger.info("Organization status changed", {
                orgId: id,
                oldStatus: existingOrg.status,
                newStatus: status,
                changedBy: user.userId,
                requestId
            });

            return c.json({
                success: true,
                message: `Organization status changed to ${status}`,
                data: updatedOrg,
                requestId
            });

        } catch (error) {
            return c.json(ErrorResponseBuilder.system("Failed to update organization status", "SYSTEM_ERROR"), 500);
        }
    }
);

/**
 * DELETE /api/v1/platform/organizations/:id
 * Soft delete organization (set status to DELETED)
 */
platformOrgs.delete("/:id", verifyAccessTokenMiddleware, requirePlatformManager, async (c) => {
    const id = c.req.param("id");
    const requestId = RequestContext.generateRequestId();
    const user = c.get('user') as any;

    try {
        const existingOrg = await db.organization.findUnique({
            where: { id },
            include: {
                _count: { select: { users: true, apps: true } }
            }
        });

        if (!existingOrg) {
            return c.json(ErrorResponseBuilder.notFound("Organization not found"), 404);
        }

        // Soft delete by setting status to INACTIVE
        const deletedOrg = await db.organization.update({
            where: { id },
            data: { status: "INACTIVE" }
        });

        Logger.info("Organization deleted", {
            orgId: id,
            deletedBy: user.userId,
            userCount: existingOrg._count.users,
            appCount: existingOrg._count.apps,
            requestId
        });

        return c.json({
            success: true,
            message: "Organization deleted successfully",
            data: {
                id: deletedOrg.id,
                status: deletedOrg.status
            },
            requestId
        });

    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to delete organization", "SYSTEM_ERROR"), 500);
    }
});

/**
 * GET /api/v1/platform/organizations/:id/stats
 * Get organization statistics
 */
platformOrgs.get("/:id/stats", verifyAccessTokenMiddleware, requirePlatformManager, async (c) => {
    const id = c.req.param("id");
    const requestId = RequestContext.generateRequestId();

    try {
        const org = await db.organization.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        users: true,
                        apps: true,
                        orgAdmins: true
                    }
                }
            }
        });

        if (!org) {
            return c.json(ErrorResponseBuilder.notFound("Organization not found"), 404);
        }

        // Get additional statistics
        const [activeUsers, pendingUsers, activeApps] = await Promise.all([
            db.user.count({ where: { organizationId: id, status: "ACTIVE" } }),
            db.user.count({ where: { organizationId: id, status: "PENDING" } }),
            db.app.count({ where: { organizationId: id, status: "ACTIVE" } }),
        ]);

        return c.json({
            success: true,
            data: {
                organization: {
                    id: org.id,
                    name: org.name,
                    status: org.status,
                    createdAt: org.createdAt
                },
                stats: {
                    totalUsers: org._count.users,
                    activeUsers,
                    pendingUsers,
                    totalApps: org._count.apps,
                    activeApps,
                    adminCount: org._count.orgAdmins,
                    maxUsers: org.maxUsers,
                    maxApps: org.maxApps,
                    usagePercent: {
                        users: org.maxUsers ? Math.round((org._count.users / org.maxUsers) * 100) : null,
                        apps: org.maxApps ? Math.round((org._count.apps / org.maxApps) * 100) : null
                    }
                }
            },
            requestId
        });

    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to fetch organization stats", "SYSTEM_ERROR"), 500);
    }
});

export default platformOrgs;
