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

export default userSecurity;
