import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import {
    ErrorResponseBuilder,
    RequestContext,
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
        // Fetch user with memberships
        const userData = await db.user.findUnique({
            where: { id: user.userId },
            select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true,
                createdAt: true,
                lastLoginAt: true,
                emailVerified: true,
                twoFactorEnabled: true,
                platformMembership: {
                    select: {
                        roleType: true,
                        isActive: true,
                    }
                },
                organizationMemberships: {
                    where: { isActive: true },
                    select: {
                        roleType: true,
                        isDefault: true,
                        organization: {
                            select: { id: true, name: true, slug: true }
                        }
                    }
                }
            }
        });

        if (!userData) {
            return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
        }

        // Build profile response
        const profileData = {
            id: userData.id,
            name: userData.name,
            email: userData.email,
            avatar: userData.avatar,
            status: userData.status,
            emailVerified: userData.emailVerified,
            twoFactorEnabled: userData.twoFactorEnabled,
            createdAt: userData.createdAt,
            lastLoginAt: userData.lastLoginAt,
            // Platform access info
            hasPlatformAccess: userData.platformMembership?.isActive ?? false,
            platformRole: userData.platformMembership?.isActive
                ? userData.platformMembership.roleType
                : undefined,
            // Organizations the user belongs to
            organizations: userData.organizationMemberships.map(m => ({
                id: m.organization.id,
                name: m.organization.name,
                slug: m.organization.slug,
                roleType: m.roleType,
                isDefault: m.isDefault,
            })),
        };

        return c.json({
            success: true,
            data: profileData,
            requestId
        });

    } catch (error) {
        console.error("Error fetching profile:", error);
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
            // Fetch current data for audit trail
            const current = await db.user.findUnique({
                where: { id: user.userId },
                select: {
                    name: true,
                    email: true,
                    platformMembership: { select: { roleType: true } },
                    organizationMemberships: {
                        where: { isDefault: true, isActive: true },
                        select: { organizationId: true }
                    }
                }
            });

            if (!current) {
                return c.json(ErrorResponseBuilder.notFound("User not found"), 404);
            }

            const updated = await db.user.update({
                where: { id: user.userId },
                data: { name: data.name },
                select: { id: true, name: true, email: true }
            });

            // Determine actor type and org context for audit
            const actorType = current.platformMembership ? "platform_manager" : "user";
            const organizationId = current.organizationMemberships[0]?.organizationId;

            // Log audit trail
            await AuditLogger.logUserManagement(
                "USER_UPDATED",
                user.userId,
                user.userId,
                updated.email,
                {
                    actorType,
                    organizationId,
                    metadata: {
                        changes: {
                            name: { from: current.name, to: data.name }
                        },
                        selfUpdate: true,
                        platformRole: current.platformMembership?.roleType,
                    }
                }
            );

            return c.json({ success: true, data: updated, requestId });
        } catch (error) {
            console.error("Error updating profile:", error);
            return c.json(ErrorResponseBuilder.system("Failed to update profile"), 500);
        }
    }
);

export default userProfile;
