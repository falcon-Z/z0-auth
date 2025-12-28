import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import {
    ErrorResponseBuilder,
    RequestContext,
    Logger
} from "@z0/utils/error-handling";
import { z } from "zod";
import { validator } from "hono/validator";
import { verifyAccessTokenMiddleware, type TokenPayload, hashPassword } from "@z0/utils/auth";
import { validatePassword } from "@z0/utils/password-validation";
import { AuditLogger } from "@z0/utils/audit-logger";

const userSecurity = new Hono();

const changePasswordSchema = z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8)
});

const firstTimeSetupSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(8),
    name: z.string().min(1).max(100).optional(),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

/**
 * POST /api/v1/users/change-password
 */
userSecurity.post("/change-password",
    verifyAccessTokenMiddleware,
    validator("json", (value, c) => {
        const parsed = changePasswordSchema.safeParse(value);
        if (!parsed.success) {
            return c.json(ErrorResponseBuilder.validation("Invalid data", [], parsed.error), 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const user = c.get('user') as TokenPayload;
        const { currentPassword, newPassword } = c.req.valid("json");
        const requestId = RequestContext.generateRequestId();

        try {
            // Get user with current password hash
            const userData = await db.user.findUnique({
                where: { id: user.userId },
                select: {
                    id: true,
                    email: true,
                    password: true,
                    platformMembership: { select: { roleType: true, isActive: true } },
                    organizationMemberships: {
                        where: { isDefault: true, isActive: true },
                        select: { organizationId: true }
                    }
                }
            });

            if (!userData) {
                return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
            }

            if (!userData.password) {
                return c.json(
                    ErrorResponseBuilder.validation(
                        "Password change not available for this account",
                        [{ field: "currentPassword", message: "Account uses external authentication" }]
                    ),
                    400
                );
            }

            // Verify current password
            const isMatch = await Bun.password.verify(currentPassword, userData.password);
            if (!isMatch) {
                return c.json(ErrorResponseBuilder.authorization("Incorrect current password"), 403);
            }

            // Validate new password strength
            const val = validatePassword(newPassword);
            if (!val.isValid) {
                return c.json(
                    ErrorResponseBuilder.validation("New password is weak", [], { feedback: val.feedback }),
                    400
                );
            }

            // Update password
            const newHash = await hashPassword(newPassword);
            await db.user.update({
                where: { id: user.userId },
                data: { password: newHash }
            });

            // Determine actor type for audit
            const actorType = userData.platformMembership?.isActive ? "platform_manager" : "user";
            const organizationId = userData.organizationMemberships[0]?.organizationId;

            // Log audit trail
            await AuditLogger.logAuth(
                "PASSWORD_CHANGED",
                c,
                user.userId,
                userData.email,
                {
                    actorType,
                    organizationId,
                    metadata: {
                        selfChange: true,
                        platformRole: userData.platformMembership?.roleType,
                    }
                }
            );

            Logger.info("Password changed successfully", { userId: user.userId, requestId });

            return c.json({
                success: true,
                message: "Password updated successfully",
                requestId
            });

        } catch (error) {
            console.error("Error changing password:", error);
            return c.json(ErrorResponseBuilder.system("Failed to change password"), 500);
        }
    }
);

/**
 * POST /api/v1/users/first-time-setup
 * First-time setup for users with requiresPasswordChange flag
 * - Verifies user has requiresPasswordChange = true
 * - Validates temp password
 * - Sets new password
 * - Optionally updates name
 * - Clears requiresPasswordChange flag
 */
userSecurity.post("/first-time-setup",
    verifyAccessTokenMiddleware,
    validator("json", (value, c) => {
        const parsed = firstTimeSetupSchema.safeParse(value);
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
        const user = c.get('user') as TokenPayload;
        const data = c.req.valid("json");
        const requestId = RequestContext.generateRequestId();

        try {
            // Get user with current state
            const userData = await db.user.findUnique({
                where: { id: user.userId },
                select: {
                    id: true,
                    email: true,
                    password: true,
                    requiresPasswordChange: true,
                    platformMembership: { select: { roleType: true, isActive: true } },
                    organizationMemberships: {
                        where: { isDefault: true, isActive: true },
                        select: { organizationId: true }
                    }
                }
            });

            if (!userData) {
                return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
            }

            // Verify user actually needs first-time setup
            if (!userData.requiresPasswordChange) {
                return c.json(
                    ErrorResponseBuilder.validation(
                        "First-time setup not required",
                        [{ field: "general", message: "Your account does not require password setup" }]
                    ),
                    400
                );
            }

            if (!userData.password) {
                return c.json(
                    ErrorResponseBuilder.validation(
                        "Password setup not available",
                        [{ field: "currentPassword", message: "Account uses external authentication" }]
                    ),
                    400
                );
            }

            // Verify current (temp) password
            const isMatch = await Bun.password.verify(data.currentPassword, userData.password);
            if (!isMatch) {
                return c.json(
                    ErrorResponseBuilder.authorization("Incorrect temporary password"),
                    403
                );
            }

            // Validate new password strength
            const pwdValidation = validatePassword(data.newPassword);
            if (!pwdValidation.isValid) {
                return c.json(
                    ErrorResponseBuilder.validation(
                        "New password does not meet requirements",
                        [],
                        { feedback: pwdValidation.feedback }
                    ),
                    400
                );
            }

            // Update user: password, name (optional), clear requiresPasswordChange
            const newHash = await hashPassword(data.newPassword);
            await db.user.update({
                where: { id: user.userId },
                data: {
                    password: newHash,
                    requiresPasswordChange: false,
                    ...(data.name && { name: data.name }),
                }
            });

            // Determine actor type for audit
            const actorType = userData.platformMembership?.isActive ? "platform_manager" : "user";
            const organizationId = userData.organizationMemberships[0]?.organizationId;

            // Log audit trail
            await AuditLogger.logAuth(
                "PASSWORD_CHANGED",
                c,
                user.userId,
                userData.email,
                {
                    actorType,
                    organizationId,
                    metadata: {
                        firstTimeSetup: true,
                        nameUpdated: !!data.name,
                        platformRole: userData.platformMembership?.roleType,
                    }
                }
            );

            Logger.info("First-time setup completed", {
                userId: user.userId,
                nameUpdated: !!data.name,
                requestId
            });

            return c.json({
                success: true,
                message: "Account setup completed successfully",
                data: {
                    requiresPasswordChange: false,
                },
                requestId
            });

        } catch (error) {
            Logger.error("Error during first-time setup:", { error, userId: user.userId });
            return c.json(ErrorResponseBuilder.system("Failed to complete setup"), 500);
        }
    }
);

/**
 * GET /api/v1/users/setup-status
 * Check if user requires first-time setup
 */
userSecurity.get("/setup-status",
    verifyAccessTokenMiddleware,
    async (c) => {
        const user = c.get('user') as TokenPayload;
        const requestId = RequestContext.generateRequestId();

        try {
            const userData = await db.user.findUnique({
                where: { id: user.userId },
                select: {
                    requiresPasswordChange: true,
                    name: true,
                    email: true,
                }
            });

            if (!userData) {
                return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
            }

            return c.json({
                success: true,
                data: {
                    requiresPasswordChange: userData.requiresPasswordChange,
                    email: userData.email,
                    name: userData.name,
                },
                requestId
            });

        } catch (error) {
            Logger.error("Error checking setup status:", { error, userId: user.userId });
            return c.json(ErrorResponseBuilder.system("Failed to check setup status"), 500);
        }
    }
);

export default userSecurity;
