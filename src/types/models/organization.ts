/**
 * Organization type definitions
 * Single source of truth for all organization-related types
 */

import type { OrgRoleType, OrganizationStatus } from "./roles";

/**
 * Base organization properties shared across all contexts
 */
export interface OrganizationBase {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: OrganizationStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Organization with count statistics (for list views)
 */
export interface OrganizationWithCounts extends OrganizationBase {
  memberCount: number;
  appCount: number;
  maxUsers?: number | null;
  maxApps?: number | null;
}

/**
 * Organization for admin/platform views with additional metadata
 */
export interface OrganizationAdmin extends OrganizationWithCounts {
  isPlatformOrg: boolean;
}

/**
 * Minimal organization info for user context (auth/org switcher)
 * Used in AuthContext and OrgContext
 */
export interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  roleType: OrgRoleType;
  isDefault: boolean;
}

/**
 * Full organization details including related data
 */
export interface OrganizationDetail extends OrganizationWithCounts {
  isPlatformOrg?: boolean;
  memberships?: OrganizationMembership[];
  apps?: OrganizationApp[];
}

/**
 * Organization membership (user's relationship to an org)
 */
export interface OrganizationMembership {
  id: string;
  userId: string;
  organizationId: string;
  roleType: OrgRoleType;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Simplified app info within organization context
 */
export interface OrganizationApp {
  id: string;
  name: string;
  slug: string;
  status: string;
}

// Input types for creating/updating organizations

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  description?: string;
  maxUsers?: number;
  maxApps?: number;
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  description?: string;
  maxUsers?: number;
  maxApps?: number;
  status?: OrganizationStatus;
}
