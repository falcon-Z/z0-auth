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

// Schema for creating an organization
const createOrgSchema = z.object({
    name: z.string().min(2).max(100),
    slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
    description: z.string().optional(),
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

export default platformOrgs;
