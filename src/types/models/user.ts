/**
 * User type definitions
 * Single source of truth for all user-related types
 */

import type { UserStatus, PlatformRoleType } from "./roles";
import type { UserOrganization } from "./organization";

/**
 * Base user properties
 */
export interface UserBase {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * User for platform admin views
 */
export interface UserAdmin extends UserBase {
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt?: string | null;
  platformRole?: PlatformRoleType | null;
  organizationCount: number;
}

/**
 * User for list views (minimal info)
 */
export interface UserListItem {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  status: UserStatus;
  lastLoginAt?: string | null;
}

/**
 * Stored user in auth context (client-side)
 */
export interface StoredUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  hasPlatformAccess: boolean;
  platformRole?: PlatformRoleType | null;
  organizations: UserOrganization[];
  requiresPasswordChange?: boolean;
}

/**
 * User profile (for profile page)
 */
export interface UserProfile extends UserBase {
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt?: string | null;
  organizations: UserOrganization[];
}

/**
 * User session
 */
export interface UserSession {
  id: string;
  deviceName?: string;
  deviceType?: string;
  ipAddress?: string;
  userAgent?: string;
  lastActiveAt: string;
  createdAt: string;
  isCurrent: boolean;
}

/**
 * User device
 */
export interface UserDevice {
  id: string;
  name?: string;
  type?: string;
  fingerprint: string;
  isTrusted: boolean;
  lastSeenAt: string;
  createdAt: string;
}

// Input types for user operations

export interface UpdateUserProfileInput {
  name?: string;
  avatar?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password?: string;
  sendInvite?: boolean;
}
