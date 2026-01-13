/**
 * Resource Quota Utilities
 * Enforce organization resource limits (maxUsers, maxApps)
 */

import { db } from "@z0/utils/db/client";
import { Logger } from "@z0/utils/error-handling";

export interface QuotaCheckResult {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number | null;
  remaining: number | null;
  reason?: string;
}

/**
 * Check if organization can add more users
 */
export async function checkUserQuota(organizationId: string): Promise<QuotaCheckResult> {
  try {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        maxUsers: true,
        _count: {
          select: {
            memberships: {
              where: { isActive: true },
            },
          },
        },
      },
    });

    if (!org) {
      return {
        allowed: false,
        currentCount: 0,
        maxAllowed: null,
        remaining: null,
        reason: "Organization not found",
      };
    }

    const currentCount = org._count.memberships;
    const maxAllowed = org.maxUsers;

    // No limit set
    if (maxAllowed === null) {
      return {
        allowed: true,
        currentCount,
        maxAllowed: null,
        remaining: null,
      };
    }

    const remaining = maxAllowed - currentCount;
    const allowed = remaining > 0;

    return {
      allowed,
      currentCount,
      maxAllowed,
      remaining: Math.max(0, remaining),
      reason: allowed ? undefined : "Organization has reached maximum user capacity",
    };
  } catch (error: any) {
    Logger.error("Failed to check user quota", { organizationId, error: error.message });
    // Fail open in case of errors (don't block operations due to quota check failures)
    return {
      allowed: true,
      currentCount: 0,
      maxAllowed: null,
      remaining: null,
    };
  }
}

/**
 * Check if organization can add more apps
 */
export async function checkAppQuota(organizationId: string): Promise<QuotaCheckResult> {
  try {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        maxApps: true,
        _count: {
          select: {
            apps: true,
          },
        },
      },
    });

    if (!org) {
      return {
        allowed: false,
        currentCount: 0,
        maxAllowed: null,
        remaining: null,
        reason: "Organization not found",
      };
    }

    const currentCount = org._count.apps;
    const maxAllowed = org.maxApps;

    // No limit set
    if (maxAllowed === null) {
      return {
        allowed: true,
        currentCount,
        maxAllowed: null,
        remaining: null,
      };
    }

    const remaining = maxAllowed - currentCount;
    const allowed = remaining > 0;

    return {
      allowed,
      currentCount,
      maxAllowed,
      remaining: Math.max(0, remaining),
      reason: allowed ? undefined : "Organization has reached maximum app capacity",
    };
  } catch (error: any) {
    Logger.error("Failed to check app quota", { organizationId, error: error.message });
    // Fail open in case of errors
    return {
      allowed: true,
      currentCount: 0,
      maxAllowed: null,
      remaining: null,
    };
  }
}

/**
 * Get quota status for an organization
 */
export async function getQuotaStatus(organizationId: string): Promise<{
  users: QuotaCheckResult;
  apps: QuotaCheckResult;
}> {
  const [users, apps] = await Promise.all([
    checkUserQuota(organizationId),
    checkAppQuota(organizationId),
  ]);

  return { users, apps };
}

/**
 * Check if user is a platform admin (bypasses quotas)
 */
export function isPlatformAdmin(platformRole: string | null | undefined): boolean {
  if (!platformRole) return false;
  return ["PLATFORM_SUPER_ADMIN", "PLATFORM_ADMIN"].includes(platformRole);
}
