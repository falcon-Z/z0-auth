/**
 * Scope Helper Functions
 *
 * Utilities for checking and managing scopes.
 */

import type {
  PlatformRoleType,
  OrgRoleType,
  AppRoleType,
  PlatformMembership,
  OrganizationMembership,
  AppMembership,
} from '@prisma/client';
import {
  PLATFORM_ROLE_SCOPES,
  ORG_ROLE_SCOPES,
  APP_ROLE_SCOPES,
  DEFAULT_SELF_SCOPES,
  USER_API_KEY_SCOPES,
} from './role-mappings';

// =============================================================================
// Scope Checking
// =============================================================================

/**
 * Check if user has a specific scope
 *
 * @param userScopes - Array of scopes the user has
 * @param requiredScope - The scope to check for
 * @returns true if user has the required scope
 */
export function hasScope(userScopes: string[], requiredScope: string): boolean {
  // Check for global wildcard
  if (userScopes.includes('*')) {
    return true;
  }

  // Check for exact match
  if (userScopes.includes(requiredScope)) {
    return true;
  }

  // Parse the required scope
  const parts = requiredScope.split(':');
  if (parts.length !== 3) {
    return false;
  }

  const [level, resource, action] = parts;

  // Check for level wildcard (e.g., "org:*" matches "org:apps:read")
  if (userScopes.includes(`${level}:*`)) {
    return true;
  }

  // Check for resource wildcard (e.g., "org:apps:*" matches "org:apps:read")
  if (userScopes.includes(`${level}:${resource}:*`)) {
    return true;
  }

  // Check for manage implies all actions
  if (action !== 'manage' && userScopes.includes(`${level}:${resource}:manage`)) {
    return true;
  }

  return false;
}

/**
 * Check if user has any of the specified scopes
 */
export function hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.some(scope => hasScope(userScopes, scope));
}

/**
 * Check if user has all of the specified scopes
 */
export function hasAllScopes(userScopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.every(scope => hasScope(userScopes, scope));
}

// =============================================================================
// Scope Building
// =============================================================================

export interface MembershipContext {
  platformMembership?: PlatformMembership | null;
  organizationMemberships?: OrganizationMembership[];
  appMemberships?: AppMembership[];
  currentOrgId?: string;
  currentAppId?: string;
  allowUserApiKeys?: boolean; // Whether the current app allows user API keys
}

/**
 * Build effective scopes for a user based on their memberships
 *
 * @param context - User's membership context
 * @returns Array of effective scopes
 */
export function buildEffectiveScopes(context: MembershipContext): string[] {
  const scopes = new Set<string>();

  // Always add self scopes for authenticated users
  DEFAULT_SELF_SCOPES.forEach(scope => scopes.add(scope));

  // Add user API key scopes if allowed
  if (context.allowUserApiKeys) {
    USER_API_KEY_SCOPES.forEach(scope => scopes.add(scope));
  }

  // Platform membership scopes
  if (context.platformMembership?.isActive) {
    const roleScopes = PLATFORM_ROLE_SCOPES[context.platformMembership.roleType];
    roleScopes.forEach(scope => scopes.add(scope));

    // Add any explicit scope overrides
    if (context.platformMembership.scopes) {
      context.platformMembership.scopes.forEach(scope => scopes.add(scope));
    }
  }

  // Organization membership scopes (for current org context)
  if (context.currentOrgId && context.organizationMemberships) {
    const orgMembership = context.organizationMemberships.find(
      m => m.organizationId === context.currentOrgId && m.isActive
    );

    if (orgMembership) {
      const roleScopes = ORG_ROLE_SCOPES[orgMembership.roleType];
      roleScopes.forEach(scope => scopes.add(scope));
    }
  }

  // App membership scopes (for current app context)
  if (context.currentAppId && context.appMemberships) {
    const appMembership = context.appMemberships.find(
      m => m.appId === context.currentAppId && m.isActive
    );

    if (appMembership) {
      const roleScopes = APP_ROLE_SCOPES[appMembership.roleType];
      roleScopes.forEach(scope => scopes.add(scope));

      // Add custom scopes assigned to this user for this app
      if (appMembership.customScopes) {
        appMembership.customScopes.forEach(scope => scopes.add(scope));
      }
    }
  }

  return Array.from(scopes);
}

/**
 * Get platform scopes from membership
 */
export function getPlatformScopes(membership: PlatformMembership | null): string[] {
  if (!membership?.isActive) return [];

  const roleScopes = PLATFORM_ROLE_SCOPES[membership.roleType] || [];
  const overrideScopes = membership.scopes || [];

  return [...new Set([...roleScopes, ...overrideScopes])];
}

/**
 * Get organization scopes from membership
 */
export function getOrgScopes(membership: OrganizationMembership | null): string[] {
  if (!membership?.isActive) return [];

  return ORG_ROLE_SCOPES[membership.roleType] || [];
}

/**
 * Get app scopes from membership
 */
export function getAppScopes(membership: AppMembership | null): string[] {
  if (!membership?.isActive) return [];

  const roleScopes = APP_ROLE_SCOPES[membership.roleType] || [];
  const customScopes = membership.customScopes || [];

  return [...new Set([...roleScopes, ...customScopes])];
}

// =============================================================================
// Scope Validation
// =============================================================================

/**
 * Validate scope format
 */
export function isValidScopeFormat(scope: string): boolean {
  // Wildcard is valid
  if (scope === '*') return true;

  const parts = scope.split(':');

  // Must have exactly 3 parts or 2 parts with wildcard
  if (parts.length === 2 && parts[1] === '*') {
    return ['platform', 'org', 'app', 'self'].includes(parts[0]);
  }

  if (parts.length !== 3) return false;

  const [level, resource, action] = parts;

  // Check level
  if (!['platform', 'org', 'app', 'self'].includes(level)) {
    return false;
  }

  // Resource and action must be non-empty
  if (!resource || !action) {
    return false;
  }

  // Validate action
  const validActions = ['read', 'write', 'delete', 'manage', '*'];
  if (!validActions.includes(action)) {
    return false;
  }

  return true;
}

/**
 * Filter scopes by level
 */
export function filterScopesByLevel(scopes: string[], level: string): string[] {
  return scopes.filter(scope => {
    if (scope === '*') return true;
    return scope.startsWith(`${level}:`);
  });
}

/**
 * Expand wildcard scopes to explicit scopes
 * Used for display purposes
 */
export function expandWildcard(scope: string, allScopes: string[]): string[] {
  if (scope === '*') {
    return allScopes;
  }

  if (scope.endsWith(':*')) {
    const prefix = scope.slice(0, -1); // Remove the *
    return allScopes.filter(s => s.startsWith(prefix));
  }

  return [scope];
}

// =============================================================================
// Permission Level Checking
// =============================================================================

/**
 * Check if scope represents manage-level access
 */
export function isManageScope(scope: string): boolean {
  return scope === '*' ||
    scope.endsWith(':*') ||
    scope.endsWith(':manage');
}

/**
 * Check if scope represents write-level access
 */
export function isWriteScope(scope: string): boolean {
  return isManageScope(scope) ||
    scope.endsWith(':write') ||
    scope.endsWith(':delete');
}

/**
 * Check if scope represents read-level access
 */
export function isReadScope(scope: string): boolean {
  return true; // All scopes imply read access
}

/**
 * Get the highest permission level from scopes for a resource
 */
export function getHighestPermissionLevel(
  scopes: string[],
  level: string,
  resource: string
): 'manage' | 'write' | 'read' | 'none' {
  // Check for wildcards first
  if (scopes.includes('*') || scopes.includes(`${level}:*`)) {
    return 'manage';
  }

  // Check for manage
  if (scopes.includes(`${level}:${resource}:manage`) ||
      scopes.includes(`${level}:${resource}:*`)) {
    return 'manage';
  }

  // Check for write/delete
  if (scopes.includes(`${level}:${resource}:write`) ||
      scopes.includes(`${level}:${resource}:delete`)) {
    return 'write';
  }

  // Check for read
  if (scopes.includes(`${level}:${resource}:read`)) {
    return 'read';
  }

  return 'none';
}
