/**
 * Platform Organization Management Utilities
 *
 * The platform organization is a special organization that:
 * 1. Is created during initial system setup
 * 2. Houses all platform-level roles (SUPER_ADMIN, ORG_MANAGER, etc.)
 * 3. Is the only organization allowed to have platform memberships
 * 4. Cannot be deleted
 * 5. Only one should exist in the system
 */

import { db } from "./db/client";
import { Logger } from "./error-handling";

/**
 * Get the platform organization
 * Returns null if not found (system not set up)
 */
export async function getPlatformOrganization() {
  try {
    const platformOrg = await db.organization.findFirst({
      where: { isPlatformOrg: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        isPlatformOrg: true,
        createdAt: true,
      },
    });

    return platformOrg;
  } catch (error) {
    Logger.error("Failed to fetch platform organization", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Check if an organization is the platform organization
 */
export async function isPlatformOrganization(
  organizationId: string
): Promise<boolean> {
  try {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { isPlatformOrg: true },
    });

    return org?.isPlatformOrg ?? false;
  } catch (error) {
    Logger.error("Failed to check if organization is platform org", {
      organizationId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Validate that a platform membership belongs to the platform organization
 * Throws an error if validation fails
 */
export async function validatePlatformMembershipOrganization(
  organizationId: string
): Promise<void> {
  const isPlatform = await isPlatformOrganization(organizationId);

  if (!isPlatform) {
    throw new Error(
      "Platform roles can only be assigned within the platform organization"
    );
  }
}

/**
 * Get all platform members with their details
 */
export async function getPlatformMembers() {
  try {
    const members = await db.platformMembership.findMany({
      where: { isActive: true },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: {
        grantedAt: "desc",
      },
    });

    return members;
  } catch (error) {
    Logger.error("Failed to fetch platform members", {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Ensure only one platform organization exists
 * Used for system integrity checks
 */
export async function validateSinglePlatformOrg(): Promise<{
  valid: boolean;
  count: number;
  organizations?: Array<{ id: string; name: string; slug: string }>;
}> {
  try {
    const platformOrgs = await db.organization.findMany({
      where: { isPlatformOrg: true },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    const count = platformOrgs.length;
    const valid = count === 1;

    if (!valid) {
      Logger.warn("Platform organization integrity check failed", {
        count,
        expected: 1,
        organizations: platformOrgs,
      });
    }

    return {
      valid,
      count,
      organizations: count !== 1 ? platformOrgs : undefined,
    };
  } catch (error) {
    Logger.error("Failed to validate platform organization uniqueness", {
      error: error.message,
    });
    throw error;
  }
}
