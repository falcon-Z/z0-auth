import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import {
    ErrorResponseBuilder,
    RequestContext,
    DatabaseErrorHandler
} from "@z0/utils/error-handling";
import { z } from "zod";
import { validator } from "hono/validator";
import { verifyAccessTokenMiddleware, type TokenPayload } from "@z0/utils/auth";
import { AuditLogger } from "@z0/utils/audit-logger";

const userProfile = new Hono();

// Schema for updating profile
const updateProfileSchema = z.object({
    name: z.string().min(1).max(100),
    // Email update usually requires verification, so skipping for now or separate flow.
});

/**
 * GET /api/v1/users/me
 * Get current user profile
 */
userProfile.get("/me", verifyAccessTokenMiddleware, async (c) => {
    const user = c.get('user') as TokenPayload;
    const requestId = RequestContext.generateRequestId();

    try {
        // Fetch fresh data
        // User could be PlatformManager or Org User?
        // "Unified Auth" logic in login said: 
        // PlatformManager -> type: "platform_manager"
        // User -> type: "user" (and orgId)
        
        // We should handle both? 
        // Roadmap said "User Self-Service". Platform Managers are users too.
        
        let profileData;

        if (user.type === 'platform_manager') {
             const manager = await db.platformManager.findUnique({
                 where: { id: user.userId },
                 select: {
                     id: true,
                     name: true,
                     email: true,
                     roleType: true,
                     organization: true, // "System" or name
                     createdAt: true,
                     lastLoginAt: true
                 }
             });
             if (!manager) return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
             profileData = { ...manager, type: 'platform_manager' };

        } else {
             const orgUser = await db.user.findUnique({
                 where: { id: user.userId },
                 include: {
                     organization: {
                         select: { id: true, name: true, slug: true }
                     }
                 }
             });
             
             if (!orgUser) return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
             
             profileData = {
                 id: orgUser.id,
                 name: orgUser.name,
                 email: orgUser.email,
                 role: orgUser.role,
                 organization: orgUser.organization,
                 status: orgUser.status,
                 createdAt: orgUser.createdAt,
                 lastLoginAt: orgUser.lastLoginAt,
                 type: 'organization_user'
             };
        }

        return c.json({
            success: true,
            data: profileData,
            requestId
        });

    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to fetch profile"), 500);
    }
});

/**
 * PUT /api/v1/users/me
 * Update profile details
 */
userProfile.put("/me",
    verifyAccessTokenMiddleware,
    validator("json", (value, c) => {
        const parsed = updateProfileSchema.safeParse(value);
        if (!parsed.success) {
            return c.json(ErrorResponseBuilder.validation("Invalid data", [], parsed.error), 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const user = c.get('user') as TokenPayload;
        const data = c.req.valid("json");
        const requestId = RequestContext.generateRequestId();

        try {
            if (user.type === 'platform_manager') {
                // Fetch current data for audit trail
                const current = await db.platformManager.findUnique({
                    where: { id: user.userId },
                    select: { name: true, email: true }
                });

                const updated = await db.platformManager.update({
                    where: { id: user.userId },
                    data: { name: data.name },
                    select: { id: true, name: true, email: true }
                });

                // Log audit trail
                await AuditLogger.logUserManagement(
                    "USER_UPDATED",
                    user.userId,
                    user.userId,
                    updated.email,
                    {
                        actorType: "platform_manager",
                        metadata: {
                            changes: {
                                name: { from: current?.name, to: data.name }
                            }
                        }
                    }
                );

                return c.json({ success: true, data: updated, requestId });
            } else {
                // Fetch current data for audit trail
                const current = await db.user.findUnique({
                    where: { id: user.userId },
                    select: { name: true, email: true, organizationId: true }
                });

                const updated = await db.user.update({
                    where: { id: user.userId },
                    data: { name: data.name },
                    select: { id: true, name: true, email: true }
                });

                // Log audit trail
                await AuditLogger.logUserManagement(
                    "USER_UPDATED",
                    user.userId,
                    user.userId,
                    updated.email,
                    {
                        actorType: "user",
                        organizationId: current?.organizationId,
                        metadata: {
                            changes: {
                                name: { from: current?.name, to: data.name }
                            },
                            selfUpdate: true
                        }
                    }
                );

                return c.json({ success: true, data: updated, requestId });
            }
        } catch (error) {
             return c.json(ErrorResponseBuilder.system("Failed to update profile"), 500);
        }
    }
);

export default userProfile;
