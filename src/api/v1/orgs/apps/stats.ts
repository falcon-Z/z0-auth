/**
 * Application Statistics API
 *
 * Provides app-specific statistics for app managers.
 */

import { Hono } from "hono";
import { requireOrgAccess } from "@z0/utils/org-access";
import { db } from "@z0/utils/db/client";
import { ErrorResponseBuilder } from "@z0/utils/error-handling";

const appStats = new Hono();

/**
 * GET /api/v1/orgs/:orgId/apps/:appId/stats
 * Returns application-specific statistics
 */
appStats.get("/", requireOrgAccess(), async (c) => {
  try {
    const orgId = c.req.param("orgId");
    const appId = c.req.param("appId");

    // Verify app belongs to org
    const app = await db.app.findFirst({
      where: { id: appId, organizationId: orgId },
    });

    if (!app) {
      const response = ErrorResponseBuilder.notFound("Application not found");
      return c.json(response, 404);
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Run queries in parallel
    const [
      userCount,
      activeUserCount,
      activeSessions,
      sessionsToday,
      sessions30d,
      activeApiKeys,
      webhooksActive,
      authMethodsUsage,
    ] = await Promise.all([
      // Total users (app members)
      db.appMembership.count({
        where: { appId },
      }),

      // Active users
      db.appMembership.count({
        where: { appId, isActive: true },
      }),

      // Active sessions
      db.session.count({
        where: { appId, status: "ACTIVE" },
      }),

      // Sessions created today
      db.session.count({
        where: {
          appId,
          createdAt: { gte: today },
        },
      }),

      // Sessions in last 30 days
      db.session.count({
        where: {
          appId,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),

      // Active API keys for this app
      db.apiKey.count({
        where: { appId, status: "ACTIVE" },
      }),

      // Active webhooks for this app
      db.webhook.count({
        where: { appId, isActive: true },
      }),

      // External identity providers used by app users
      db.externalIdentity.groupBy({
        by: ["provider"],
        where: {
          user: {
            appMemberships: {
              some: { appId, isActive: true },
            },
          },
        },
        _count: true,
      }),
    ]);

    // Session activity over time (last 30 days, grouped by day)
    const sessionActivity = await db.session.groupBy({
      by: ["createdAt"],
      where: {
        appId,
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: true,
    });

    // User growth over last 30 days
    const userGrowth = await db.appMembership.groupBy({
      by: ["createdAt"],
      where: {
        appId,
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: true,
    });

    // Top users by session count
    const topUsers = await db.session.groupBy({
      by: ["userId"],
      where: {
        appId,
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: true,
      orderBy: {
        _count: {
          userId: "desc",
        },
      },
      take: 10,
    });

    return c.json({
      success: true,
      data: {
        users: {
          total: userCount,
          active: activeUserCount,
          growth30d: userGrowth.length,
        },
        sessions: {
          active: activeSessions,
          today: sessionsToday,
          last30Days: sessions30d,
          activity: sessionActivity.map((item) => ({
            date: item.createdAt,
            count: item._count,
          })),
        },
        authentication: {
          methods: authMethodsUsage.map((item) => ({
            provider: item.provider,
            count: item._count,
          })),
          enabledMethods: app.enabledAuthMethods || ["password"],
        },
        api: {
          activeKeys: activeApiKeys,
          activeWebhooks: webhooksActive,
        },
        engagement: {
          topUsers: topUsers.map((item) => ({
            userId: item.userId,
            sessionCount: item._count,
          })),
        },
      },
    });
  } catch (error) {
    const response = ErrorResponseBuilder.internal(
      "Failed to fetch application statistics"
    );
    return c.json(response, 500);
  }
});

export default appStats;
