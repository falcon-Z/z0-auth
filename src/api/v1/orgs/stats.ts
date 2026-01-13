/**
 * Organization Statistics API
 *
 * Provides org-specific statistics for org admins.
 */

import { Hono } from "hono";
import { requireOrgAccess } from "@z0/middleware/require-scope";
import { db } from "@z0/utils/db/client";
import { ErrorResponseBuilder } from "@z0/utils/error-handling";

const orgStats = new Hono();

/**
 * GET /api/v1/orgs/:orgId/stats
 * Returns organization-specific statistics
 */
orgStats.get("/:orgId/stats", requireOrgAccess(), async (c) => {
  try {
    const orgId = c.req.param("orgId");
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Run queries in parallel
    const [
      memberCount,
      activeMemberCount,
      invitationsPending,
      appCount,
      activeAppCount,
      activeApiKeys,
      recentLogins,
      sessionsToday,
      webhooksActive,
      rolesCount,
    ] = await Promise.all([
      // Total members
      db.organizationMembership.count({
        where: { organizationId: orgId },
      }),

      // Active members
      db.organizationMembership.count({
        where: { organizationId: orgId, isActive: true },
      }),

      // Pending invitations
      db.invitation.count({
        where: {
          organizationId: orgId,
          acceptedAt: null,
          declinedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),

      // Total apps
      db.app.count({
        where: { organizationId: orgId },
      }),

      // Active apps
      db.app.count({
        where: { organizationId: orgId, status: "ACTIVE" },
      }),

      // Active API keys across all apps
      db.apiKey.count({
        where: {
          app: { organizationId: orgId },
          status: "ACTIVE",
        },
      }),

      // Recent logins (last 7 days) by org members
      db.session.count({
        where: {
          user: {
            organizationMemberships: {
              some: { organizationId: orgId, isActive: true },
            },
          },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),

      // Sessions created today
      db.session.count({
        where: {
          user: {
            organizationMemberships: {
              some: { organizationId: orgId, isActive: true },
            },
          },
          createdAt: { gte: today },
          status: "ACTIVE",
        },
      }),

      // Active webhooks
      db.webhook.count({
        where: {
          organizationId: orgId,
          isActive: true,
        },
      }),

      // Custom roles
      db.role.count({
        where: {
          organizationId: orgId,
          isActive: true,
        },
      }),
    ]);

    // Member growth over last 30 days
    const memberGrowth = await db.organizationMembership.groupBy({
      by: ["createdAt"],
      where: {
        organizationId: orgId,
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: true,
    });

    // App usage stats
    const appSessions = await db.session.groupBy({
      by: ["appId"],
      where: {
        app: { organizationId: orgId },
        createdAt: { gte: thirtyDaysAgo },
        status: "ACTIVE",
      },
      _count: true,
    });

    return c.json({
      success: true,
      data: {
        members: {
          total: memberCount,
          active: activeMemberCount,
          pendingInvitations: invitationsPending,
          growth30d: memberGrowth.length,
        },
        apps: {
          total: appCount,
          active: activeAppCount,
          topByUsage: appSessions
            .sort((a, b) => b._count - a._count)
            .slice(0, 5)
            .map((app) => ({
              appId: app.appId,
              sessions: app._count,
            })),
        },
        activity: {
          recentLogins7d: recentLogins,
          sessionsToday: sessionsToday,
          activeApiKeys: activeApiKeys,
          activeWebhooks: webhooksActive,
        },
        configuration: {
          customRoles: rolesCount,
        },
      },
    });
  } catch (error) {
    const response = ErrorResponseBuilder.internal(
      "Failed to fetch organization statistics"
    );
    return c.json(response, 500);
  }
});

export default orgStats;
