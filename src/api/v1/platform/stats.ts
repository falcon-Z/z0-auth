/**
 * Platform Statistics API
 *
 * Provides system-wide statistics for platform admins.
 * Requires SUPER_ADMIN or platform management roles.
 */

import { Hono } from "hono";
import { requirePlatformAccess } from "@z0/middleware/require-scope";
import { db } from "@z0/utils/db/client";
import { ErrorResponseBuilder } from "@z0/utils/error-handling";

const platformStats = new Hono();

/**
 * GET /api/v1/platform/stats
 * Returns platform-wide statistics
 */
platformStats.get("/", requirePlatformAccess(), async (c) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Run queries in parallel for better performance
    const [
      totalOrgs,
      activeOrgs,
      totalUsers,
      activeUsers,
      totalApps,
      activeApps,
      activeSessionsToday,
      newUsersToday,
      newOrgsToday,
      webhookDeliveries24h,
      failedWebhooks24h,
    ] = await Promise.all([
      // Total organizations
      db.organization.count(),

      // Active organizations
      db.organization.count({
        where: { status: "ACTIVE" },
      }),

      // Total users
      db.user.count({
        where: { isPermanentlyDeleted: false },
      }),

      // Active users
      db.user.count({
        where: { status: "ACTIVE", isPermanentlyDeleted: false },
      }),

      // Total apps
      db.app.count(),

      // Active apps
      db.app.count({
        where: { status: "ACTIVE" },
      }),

      // Active sessions today
      db.session.count({
        where: {
          status: "ACTIVE",
          createdAt: { gte: today },
        },
      }),

      // New users today
      db.user.count({
        where: {
          createdAt: { gte: today },
        },
      }),

      // New orgs today
      db.organization.count({
        where: {
          createdAt: { gte: today },
        },
      }),

      // Webhook deliveries in last 24 hours
      db.webhookEvent.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),

      // Failed webhook deliveries in last 24 hours
      db.webhookEvent.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          status: "failed",
        },
      }),
    ]);

    // Calculate growth trends (last 30 days)
    const [userGrowth, orgGrowth] = await Promise.all([
      db.user.groupBy({
        by: ["createdAt"],
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: true,
      }),

      db.organization.groupBy({
        by: ["createdAt"],
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: true,
      }),
    ]);

    return c.json({
      success: true,
      data: {
        overview: {
          totalOrganizations: totalOrgs,
          activeOrganizations: activeOrgs,
          totalUsers: totalUsers,
          activeUsers: activeUsers,
          totalApps: totalApps,
          activeApps: activeApps,
        },
        today: {
          activeSessions: activeSessionsToday,
          newUsers: newUsersToday,
          newOrganizations: newOrgsToday,
        },
        webhooks: {
          deliveries24h: webhookDeliveries24h,
          failed24h: failedWebhooks24h,
          successRate:
            webhookDeliveries24h > 0
              ? ((webhookDeliveries24h - failedWebhooks24h) / webhookDeliveries24h) * 100
              : 0,
        },
        growth: {
          users: userGrowth.length,
          organizations: orgGrowth.length,
        },
      },
    });
  } catch (error) {
    const response = ErrorResponseBuilder.internal(
      "Failed to fetch platform statistics"
    );
    return c.json(response, 500);
  }
});

export default platformStats;
