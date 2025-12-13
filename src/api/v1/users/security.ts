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
            // 1. Get current hash
            let currentHash = "";
            let email = ""; // For logging

            if (user.type === 'platform_manager') {
                const manager = await db.platformManager.findUnique({ where: { id: user.userId } });
                if (!manager) return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
                currentHash = manager.password;
                email = manager.email;
            } else {
                const orgUser = await db.user.findUnique({ where: { id: user.userId } });
                if (!orgUser) return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
                currentHash = orgUser.password;
                email = orgUser.email;
            }

            // 2. Verify current password
            const isMatch = await Bun.password.verify(currentPassword, currentHash);
            if (!isMatch) {
                return c.json(ErrorResponseBuilder.authorization("Incorrect current password"), 403); // Or 400/401
            }

            // 3. Validate new password strength
            const val = validatePassword(newPassword);
            if (!val.isValid) {
                 return c.json(ErrorResponseBuilder.validation("New password is weak", [], { feedback: val.feedback }), 400);
            }

            // 4. Update
            const newHash = await hashPassword(newPassword);

            if (user.type === 'platform_manager') {
                await db.platformManager.update({
                    where: { id: user.userId },
                    data: { password: newHash }
                });
            } else {
                await db.user.update({
                    where: { id: user.userId },
                    data: { password: newHash }
                });
            }

            Logger.info("Password changed successfully", { userId: user.userId, requestId });

            return c.json({
                success: true,
                message: "Password updated successfully",
                requestId
            });

        } catch (error) {
            return c.json(ErrorResponseBuilder.system("Failed to change password"), 500);
        }
    }
);

export default userSecurity;
