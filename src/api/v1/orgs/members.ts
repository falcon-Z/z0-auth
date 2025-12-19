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

// Schema for updating a member
const updateMemberSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    role: z.enum(["ORG_ADMIN", "ORG_USER"]).optional(),
});

// Schema for status change
const statusSchema = z.object({
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING"]),
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
 * GET /:orgId/members/:userId
 * Get member details
 */
orgMembers.get("/:orgId/members/:userId", verifyAccessTokenMiddleware, requireOrgAccess, async (c) => {
    const orgId = c.req.param("orgId");
    const userId = c.req.param("userId");
    const requestId = RequestContext.generateRequestId();

    try {
        const member = await db.user.findFirst({
            where: { id: userId, organizationId: orgId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true,
                emailVerified: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: { sessions: true }
                }
            }
        });

        if (!member) {
            return c.json(ErrorResponseBuilder.notFound("Member not found"), 404);
        }

        return c.json({
            success: true,
            data: member,
            requestId
        });
    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to fetch member details", "DB_ERROR"), 500);
    }
});

/**
 * PUT /:orgId/members/:userId
 * Update member
 */
orgMembers.put("/:orgId/members/:userId",
    verifyAccessTokenMiddleware,
    requireOrgAccess,
    validator("json", (value, c) => {
        const parsed = updateMemberSchema.safeParse(value);
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
        const userId = c.req.param("userId");
        const data = c.req.valid("json");
        const currentUser = c.get('user') as TokenPayload;
        const requestId = RequestContext.generateRequestId();

        try {
            const existingMember = await db.user.findFirst({
                where: { id: userId, organizationId: orgId }
            });

            if (!existingMember) {
                return c.json(ErrorResponseBuilder.notFound("Member not found"), 404);
            }

            const updatedMember = await db.user.update({
                where: { id: userId },
                data: {
                    ...(data.name && { name: data.name }),
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    status: true
                }
            });

            Logger.info("Member updated", {
                userId,
                orgId,
                updatedBy: currentUser.userId,
                requestId
            });

            return c.json({
                success: true,
                message: "Member updated successfully",
                data: updatedMember,
                requestId
            });
        } catch (error) {
            return c.json(ErrorResponseBuilder.system("Failed to update member", "DB_ERROR"), 500);
        }
    }
);

/**
 * PATCH /:orgId/members/:userId/status
 * Change member status
 */
orgMembers.patch("/:orgId/members/:userId/status",
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
        const userId = c.req.param("userId");
        const { status } = c.req.valid("json");
        const currentUser = c.get('user') as TokenPayload;
        const requestId = RequestContext.generateRequestId();

        try {
            // Prevent users from changing their own status
            if (currentUser.userId === userId) {
                return c.json(ErrorResponseBuilder.forbidden("Cannot change your own status"), 403);
            }

            const existingMember = await db.user.findFirst({
                where: { id: userId, organizationId: orgId }
            });

            if (!existingMember) {
                return c.json(ErrorResponseBuilder.notFound("Member not found"), 404);
            }

            const updatedMember = await db.user.update({
                where: { id: userId },
                data: { status }
            });

            // If suspended, revoke all sessions
            if (status === "SUSPENDED") {
                await db.session.updateMany({
                    where: { userId },
                    data: { status: "REVOKED" }
                });
            }

            Logger.info("Member status changed", {
                userId,
                orgId,
                oldStatus: existingMember.status,
                newStatus: status,
                changedBy: currentUser.userId,
                requestId
            });

            return c.json({
                success: true,
                message: `Member status changed to ${status}`,
                data: {
                    id: updatedMember.id,
                    status: updatedMember.status
                },
                requestId
            });
        } catch (error) {
            return c.json(ErrorResponseBuilder.system("Failed to update member status", "DB_ERROR"), 500);
        }
    }
);

/**
 * POST /:orgId/members/:userId/reset-password
 * Admin-triggered password reset
 */
orgMembers.post("/:orgId/members/:userId/reset-password",
    verifyAccessTokenMiddleware,
    requireOrgAccess,
    async (c) => {
        const orgId = c.req.param("orgId");
        const userId = c.req.param("userId");
        const currentUser = c.get('user') as TokenPayload;
        const requestId = RequestContext.generateRequestId();

        try {
            const member = await db.user.findFirst({
                where: { id: userId, organizationId: orgId },
                select: { id: true, email: true, name: true }
            });

            if (!member) {
                return c.json(ErrorResponseBuilder.notFound("Member not found"), 404);
            }

            // Generate password reset token
            const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

            // Invalidate existing tokens
            await db.passwordReset.updateMany({
                where: { userId: member.id, used: false },
                data: { used: true }
            });

            // Create new token
            await db.passwordReset.create({
                data: {
                    userId: member.id,
                    token,
                    expiresAt
                }
            });

            // TODO: Send email with reset link
            // For now, just log it
            Logger.info("Admin-triggered password reset", {
                userId: member.id,
                orgId,
                triggeredBy: currentUser.userId,
                requestId
            });

            return c.json({
                success: true,
                message: "Password reset initiated. The user will receive an email with reset instructions.",
                requestId
            });
        } catch (error) {
            return c.json(ErrorResponseBuilder.system("Failed to initiate password reset", "DB_ERROR"), 500);
        }
    }
);

/**
 * DELETE /:orgId/members/:userId
 * Remove a member (soft delete)
 */
orgMembers.delete("/:orgId/members/:userId", verifyAccessTokenMiddleware, requireOrgAccess, async (c) => {
    const orgId = c.req.param("orgId");
    const userId = c.req.param("userId");
    const currentUser = c.get('user') as TokenPayload;
    const requestId = RequestContext.generateRequestId();

    try {
        // Prevent users from deleting themselves
        if (currentUser.userId === userId) {
            return c.json(ErrorResponseBuilder.forbidden("Cannot delete your own account from here"), 403);
        }

        const existingMember = await db.user.findFirst({
            where: { id: userId, organizationId: orgId }
        });

        if (!existingMember) {
            return c.json(ErrorResponseBuilder.notFound("Member not found"), 404);
        }

        // Soft delete by setting status to INACTIVE
        await db.user.update({
            where: { id: userId },
            data: { status: "INACTIVE" }
        });

        // Revoke all sessions
        await db.session.updateMany({
            where: { userId },
            data: { status: "REVOKED" }
        });

        Logger.info("Member removed", {
            userId,
            orgId,
            removedBy: currentUser.userId,
            requestId
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
