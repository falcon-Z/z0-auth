import { Hono } from "hono";
import { db } from "@z0/utils/db/client";
import {
    Logger,
    ErrorResponseBuilder,
    RequestContext
} from "@z0/utils/error-handling";
import { verifyAccessTokenMiddleware, type TokenPayload } from "@z0/utils/auth";
import { AuditLogger } from "@z0/utils/audit-logger";

const userSessions = new Hono();

/**
 * GET /api/v1/users/sessions
 * List current user's sessions
 */
userSessions.get("/sessions", verifyAccessTokenMiddleware, async (c) => {
    const currentUser = c.get('user') as TokenPayload;
    const requestId = RequestContext.generateRequestId();
    const currentSessionId = c.get('sessionId') as string | undefined;

    try {
        const sessions = await db.session.findMany({
            where: {
                userId: currentUser.userId,
                status: { in: ["ACTIVE", "IDLE"] }
            },
            orderBy: { lastUsedAt: 'desc' },
            select: {
                id: true,
                userAgent: true,
                ipAddress: true,
                deviceInfo: true,
                createdAt: true,
                lastUsedAt: true,
                expiresAt: true,
                status: true,
            }
        });

        // Mark current session
        const sessionsWithCurrent = sessions.map(session => ({
            ...session,
            isCurrent: session.id === currentSessionId,
        }));

        return c.json({
            success: true,
            data: sessionsWithCurrent,
            requestId
        });
    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to list sessions", "DB_ERROR"), 500);
    }
});

/**
 * GET /api/v1/users/sessions/current
 * Get current session details
 */
userSessions.get("/sessions/current", verifyAccessTokenMiddleware, async (c) => {
    const currentUser = c.get('user') as TokenPayload;
    const currentSessionId = c.get('sessionId') as string | undefined;
    const requestId = RequestContext.generateRequestId();

    if (!currentSessionId) {
        return c.json(ErrorResponseBuilder.notFound("Session not found"), 404);
    }

    try {
        const session = await db.session.findFirst({
            where: {
                id: currentSessionId,
                userId: currentUser.userId
            },
            select: {
                id: true,
                userAgent: true,
                ipAddress: true,
                deviceInfo: true,
                createdAt: true,
                lastUsedAt: true,
                expiresAt: true,
                status: true,
            }
        });

        if (!session) {
            return c.json(ErrorResponseBuilder.notFound("Session not found"), 404);
        }

        return c.json({
            success: true,
            data: {
                ...session,
                isCurrent: true,
            },
            requestId
        });
    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to get session details", "DB_ERROR"), 500);
    }
});

/**
 * DELETE /api/v1/users/sessions/:sessionId
 * Revoke a specific session
 */
userSessions.delete("/sessions/:sessionId", verifyAccessTokenMiddleware, async (c) => {
    const currentUser = c.get('user') as TokenPayload;
    const sessionId = c.req.param("sessionId");
    const currentSessionId = c.get('sessionId') as string | undefined;
    const requestId = RequestContext.generateRequestId();

    // Prevent revoking current session through this endpoint
    if (sessionId === currentSessionId) {
        return c.json(
            ErrorResponseBuilder.validation("Cannot revoke current session. Use logout instead.", []),
            400
        );
    }

    try {
        const session = await db.session.findFirst({
            where: {
                id: sessionId,
                userId: currentUser.userId
            }
        });

        if (!session) {
            return c.json(ErrorResponseBuilder.notFound("Session not found"), 404);
        }

        await db.session.update({
            where: { id: sessionId },
            data: { status: "REVOKED" }
        });

        // Log audit trail
        await AuditLogger.log({
            action: "SESSION_REVOKED",
            severity: "MEDIUM",
            actorId: currentUser.userId,
            actorType: currentUser.type === 'platform_manager' ? 'platform_manager' : 'user',
            targetId: sessionId,
            targetType: "session",
            metadata: {
                revokedBy: "user",
                deviceInfo: session.deviceInfo
            }
        });

        Logger.info("Session revoked", {
            sessionId,
            userId: currentUser.userId,
            requestId
        });

        return c.json({
            success: true,
            message: "Session revoked successfully",
            requestId
        });
    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to revoke session", "DB_ERROR"), 500);
    }
});

/**
 * DELETE /api/v1/users/sessions
 * Revoke all sessions except current
 */
userSessions.delete("/sessions", verifyAccessTokenMiddleware, async (c) => {
    const currentUser = c.get('user') as TokenPayload;
    const currentSessionId = c.get('sessionId') as string | undefined;
    const requestId = RequestContext.generateRequestId();

    try {
        const result = await db.session.updateMany({
            where: {
                userId: currentUser.userId,
                id: { not: currentSessionId },
                status: { in: ["ACTIVE", "IDLE"] }
            },
            data: { status: "REVOKED" }
        });

        // Log audit trail
        await AuditLogger.log({
            action: "SESSION_REVOKED",
            severity: "HIGH",
            actorId: currentUser.userId,
            actorType: currentUser.type === 'platform_manager' ? 'platform_manager' : 'user',
            metadata: {
                revokedBy: "user",
                bulkRevocation: true,
                revokedCount: result.count,
                currentSessionPreserved: true
            }
        });

        Logger.info("All other sessions revoked", {
            userId: currentUser.userId,
            count: result.count,
            requestId
        });

        return c.json({
            success: true,
            message: `${result.count} session(s) revoked. You remain signed in on this device.`,
            data: {
                revokedCount: result.count
            },
            requestId
        });
    } catch (error) {
        return c.json(ErrorResponseBuilder.system("Failed to revoke sessions", "DB_ERROR"), 500);
    }
});

export default userSessions;
