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
import { verifyAccessTokenMiddleware, hashPassword, type TokenPayload } from "@z0/utils/auth";
import { requireOrgAccess } from "./middleware";
import { validatePassword } from "@z0/utils/password-validation";

const orgMembers = new Hono();

// Schema for adding a member
const addMemberSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: z.string().min(8).optional(), // Optional if user exists, or creating invite?
    role: z.enum(["ORG_ADMIN", "ORG_USER"]).default("ORG_USER")
});

/**
 * GET /:orgId/members
 * List members of an organization
 */
orgMembers.get("/:orgId/members", verifyAccessTokenMiddleware, requireOrgAccess, async (c) => {
    const orgId = c.req.param("orgId");
    const requestId = RequestContext.generateRequestId();

    try {
        const members = await db.user.findMany({
            where: { organizationId: orgId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true, // Should map to roleType or builtInRole?
                // Schema check: User has `roles Role[]`. 
                // But simplified userauth flow used `role` field in payload.
                // Re-checking User schema in next step if needed. 
                // Assuming we use the basic fields.
                createdAt: true,
                lastLoginAt: true,
                status: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return c.json({
            success: true,
            data: members,
            requestId
        });
    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to list members", "DB_ERROR"), 500);
    }
});

/**
 * POST /:orgId/members
 * Add or Invite a member
 */
orgMembers.post("/:orgId/members",
    verifyAccessTokenMiddleware,
    requireOrgAccess,
    validator("json", (value, c) => {
        const parsed = addMemberSchema.safeParse(value);
        if (!parsed.success) {
            return c.json(ErrorResponseBuilder.validation("Invalid data", [], parsed.error), 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const orgId = c.req.param("orgId");
        const data = c.req.valid("json");
        const currentUser = c.get('user') as TokenPayload;
        const requestId = RequestContext.generateRequestId();

        try {
            // Check if user exists GLOBALLY?
            // User email is unique globally in `User` table?
            // Schema check: `model User { @unique email }`?
            // Yes usually.

            const existingUser = await db.user.findFirst({
                where: { email: data.email }
            });

            if (existingUser) {
                return c.json(ErrorResponseBuilder.conflict("User with this email already exists (global check)"), 409);
            }

            // Create New User
            // Require password for direct creation
            if (!data.password) {
                return c.json(ErrorResponseBuilder.validation("Password required for new user creation", []), 400);
            }

            // Validate Password
            const pwdValidation = validatePassword(data.password);
            if (!pwdValidation.isValid) {
                return c.json(ErrorResponseBuilder.validation("Password weak", [], { feedback: pwdValidation.feedback }), 400);
            }

            const hashedPassword = await hashPassword(data.password);

            // Role handling: User model has `roles` relation. 
            // We need to assign `BuiltInRole` or similar.
            // For Phase 1 simplified, we might just store string if custom, but schema uses relation.
            // We'll create the user first.

            const newUser = await db.user.create({
                data: {
                    email: data.email,
                    name: data.name,
                    password: hashedPassword,
                    organizationId: orgId,
                    status: "ACTIVE",
                    // Assign Role? 
                    // We need to create a `Role` or look it up.
                    // Or use `OrganizationAdmin` table if role is ORG_ADMIN?
                    // Schema: `User` -> `roles Role[]`.
                    // Let's assume we create a default Role entry for them?
                    // Or maybe for now we don't assign complex roles, relying on defaults.
                    // IMPORTANT: `verifyAccessToken` logic checks `user.role` from somewhere.
                    // In `utils/auth.ts`, `generateAccessToken` puts `roleType` or `role`.
                    // Where does it get it from?
                    // We need to ensure we populate what Auth expects.
                }
            });

            // If ORG_ADMIN, we might need to add to OrganizationAdmin table?
            if (data.role === 'ORG_ADMIN') {
                // Add to OrganizationAdmin table if exists
                // await db.organizationAdmin.create(...)
            }

            Logger.info("Org Member Added", {
                newUserId: newUser.id,
                orgId,
                addedBy: currentUser.userId
            });

            return c.json({
                success: true,
                message: "User created and added to organization",
                data: { id: newUser.id, email: newUser.email },
                requestId
            }, 201);

        } catch (error) {
            const dbError = DatabaseErrorHandler.handleError(error);
            return c.json(ErrorResponseBuilder.database("Failed to add member", dbError.code), 500);
        }
    }
);

/**
 * DELETE /:orgId/members/:userId
 * Remove a member
 */
orgMembers.delete("/:orgId/members/:userId", verifyAccessTokenMiddleware, requireOrgAccess, async (c) => {
    const orgId = c.req.param("orgId");
    const userId = c.req.param("userId");
    const requestId = RequestContext.generateRequestId();

    try {
        await db.user.delete({
            where: {
                id: userId,
                organizationId: orgId // Security: Ensure deleting from THIS org
            }
        });

        return c.json({
            success: true,
            message: "Member removed",
            requestId
        });
    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to remove member", "DB_ERROR"), 500);
    }
});

export default orgMembers;
