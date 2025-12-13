import { Hono } from "hono";
import { z } from "zod";
import { validator } from "hono/validator";
import { db } from "@z0/utils/db/client";
import {
    Logger,
    DatabaseErrorHandler,
    ErrorResponseBuilder,
    RequestContext,
    type FieldError
} from "@z0/utils/error-handling";
import { hashPassword, type TokenPayload } from "@z0/utils/auth";
import { validatePassword } from "@z0/utils/password-validation";

const platformUsers = new Hono();

/**
 * Zod Schemas
 */
const createPlatformUserSchema = z.object({
    email: z.string().email("Invalid email address"),
    name: z.string().min(1, "Name is required"),
    password: z.string().min(8, "Password must be at least 8 characters"), // Should ideally default to invite flow (no password), but checklist implies simple creation
    roleType: z.enum(["SUPER_ADMIN", "SECURITY_MANAGER", "SUPPORT_ADMIN"]).default("SUPPORT_ADMIN"), // Assuming these roles exist or map to PlatformRoleType enum
});

// Middleware to ensure SUPER_ADMIN for creating other admins? 
// Or any Platform Manager can create others? Usually stricter.
// verifyAccessTokenMiddleware and requirePlatformManager are already on parent router.
// We should check role here.

/**
 * GET /api/v1/platform/users
 * List all platform managers
 */
platformUsers.get("/", async (c) => {
    const requestId = RequestContext.generateRequestId();
    try {
        const managers = await db.platformManager.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                roleType: true,
                createdAt: true,
                lastLoginAt: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return c.json({
            success: true,
            data: managers,
            requestId
        });
    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to list platform users", "SYSTEM_ERROR"), 500);
    }
});

/**
 * POST /api/v1/platform/users
 * Create a new platform manager
 */
platformUsers.post("/",
    validator("json", (value, c) => {
        const parsed = createPlatformUserSchema.safeParse(value);
        if (!parsed.success) {
            return c.json(ErrorResponseBuilder.validation("Invalid data", [], parsed.error), 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const requestId = RequestContext.generateRequestId();
        const data = c.req.valid("json");
        const currentUser = c.get('user') as TokenPayload;

        // Security Check: Only SUPER_ADMIN can create valid admins
        if (currentUser.roleType !== 'SUPER_ADMIN') {
            return c.json(ErrorResponseBuilder.authorization("Only Super Admins can manage platform users"), 403);
        }

        try {
            // Check existing
            const existing = await db.platformManager.findUnique({
                where: { email: data.email }
            });

            if (existing) {
                return c.json(ErrorResponseBuilder.conflict("Platform user with this email already exists"), 409);
            }

            // Validate Password
            const pwdValidation = validatePassword(data.password);
            if (!pwdValidation.isValid) {
                return c.json(ErrorResponseBuilder.validation("Password weak", [], { feedback: pwdValidation.feedback }), 400);
            }

            const hashedPassword = await hashPassword(data.password);

            const newUser = await db.platformManager.create({
                data: {
                    email: data.email,
                    name: data.name,
                    password: hashedPassword,
                    roleType: data.roleType as any, // Cast to enum
                    organization: "System", // Platform managers belong to System context usually
                    scopes: ["*"] // Simplification for now
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    roleType: true,
                    createdAt: true
                }
            });

            Logger.info("Platform user created", {
                newUserId: newUser.id,
                createdBy: currentUser.userId,
                role: data.roleType
            });

            return c.json({
                success: true,
                message: "Platform user created successfully",
                data: newUser,
                requestId
            }, 201);

        } catch (error) {
            const dbError = DatabaseErrorHandler.handleError(error);
            return c.json(ErrorResponseBuilder.database("Failed to create user", dbError.code), 500);
        }
    }
);

/**
 * DELETE /api/v1/platform/users/:id
 * Remove a platform manager
 */
platformUsers.delete("/:id", async (c) => {
    const requestId = RequestContext.generateRequestId();
    const id = c.req.param("id");
    const currentUser = c.get('user') as TokenPayload;

    if (currentUser.roleType !== 'SUPER_ADMIN') {
        return c.json(ErrorResponseBuilder.authorization("Only Super Admins can delete platform users"), 403);
    }

    if (id === currentUser.userId) {
        return c.json(ErrorResponseBuilder.validation("Cannot delete yourself", []), 400);
    }

    try {
        await db.platformManager.delete({
            where: { id }
        });

        Logger.info("Platform user deleted", {
            deletedUserId: id,
            deletedBy: currentUser.userId
        });

        return c.json({
            success: true,
            message: "User deleted",
            requestId
        });
    } catch (error) {
        // Check if not found?
        return c.json(ErrorResponseBuilder.system("Failed to delete user", "SYSTEM_ERROR"), 500);
    }
});


export default platformUsers;
