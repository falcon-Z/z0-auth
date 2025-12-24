/**
 * Role to Scope Mappings
 *
 * Defines the default scopes granted to each role type.
 * These are the base scopes - additional scopes can be granted explicitly.
 */

import type { PlatformRoleType, OrgRoleType, AppRoleType } from '@prisma/client';

// =============================================================================
// Platform Role Scopes
// =============================================================================

export const PLATFORM_ROLE_SCOPES: Record<PlatformRoleType, string[]> = {
  // Super Admin has full access
  SUPER_ADMIN: ['*'],

  // Org Manager can manage organizations and view users
  ORG_MANAGER: [
    'platform:organizations:read',
    'platform:organizations:write',
    'platform:organizations:delete',
    'platform:organizations:manage',
    'platform:users:read',
  ],

  // Security Manager handles security settings and audit
  SECURITY_MANAGER: [
    'platform:security:read',
    'platform:security:write',
    'platform:security:lockouts:manage',
    'platform:audit:read',
    'platform:audit:export',
    'platform:users:read',
  ],

  // Auditor has read-only access to audit logs
  AUDITOR: [
    'platform:audit:read',
    'platform:audit:export',
    'platform:organizations:read',
    'platform:users:read',
  ],

  // Support Manager helps users but has limited access
  SUPPORT_MANAGER: [
    'platform:organizations:read',
    'platform:users:read',
    'platform:audit:read',
  ],
};

// =============================================================================
// Organization Role Scopes
// =============================================================================

export const ORG_ROLE_SCOPES: Record<OrgRoleType, string[]> = {
  // Org Owner has full control over the organization
  ORG_OWNER: ['org:*'],

  // Org Admin can manage everything except ownership transfer
  ORG_ADMIN: [
    'org:apps:read',
    'org:apps:write',
    'org:apps:delete',
    'org:apps:manage',
    'org:members:read',
    'org:members:invite',
    'org:members:write',
    'org:members:remove',
    'org:members:manage',
    'org:settings:read',
    'org:settings:write',
    'org:roles:read',
    'org:roles:write',
    'org:roles:delete',
    'org:roles:manage',
    'org:scopes:read',
    'org:scopes:write',
    'org:scopes:manage',
    'org:providers:read',
    'org:providers:write',
    'org:api-keys:read',
    'org:api-keys:write',
    'org:api-keys:rotate',
    'org:api-keys:revoke',
  ],

  // Org Developer can work with apps and limited member view
  ORG_DEVELOPER: [
    'org:apps:read',
    'org:apps:write',
    'org:members:read',
    'org:settings:read',
    'org:roles:read',
    'org:scopes:read',
    'org:api-keys:read',
    'org:api-keys:write',
  ],

  // Org Member has minimal read access
  ORG_MEMBER: [
    'org:apps:read',
    'org:members:read',
    'org:settings:read',
  ],
};

// =============================================================================
// App Role Scopes
// =============================================================================

export const APP_ROLE_SCOPES: Record<AppRoleType, string[]> = {
  // App Owner has full control
  APP_OWNER: ['app:*'],

  // App Manager can manage settings and users
  APP_MANAGER: [
    'app:settings:read',
    'app:settings:write',
    'app:users:read',
    'app:users:write',
    'app:users:remove',
    'app:users:manage',
    'app:sessions:read',
    'app:sessions:revoke',
    'app:api-keys:read',
    'app:api-keys:write',
    'app:api-keys:manage',
    'app:scopes:read',
    'app:scopes:write',
    'app:scopes:assign',
  ],

  // App User has read access only (plus self scopes and any custom scopes)
  APP_USER: [
    'app:settings:read',
  ],
};

// =============================================================================
// Self Scopes (Always Granted to Authenticated Users)
// =============================================================================

export const DEFAULT_SELF_SCOPES: string[] = [
  'self:profile:read',
  'self:profile:write',
  'self:credentials:read',
  'self:credentials:write',
  'self:2fa:read',
  'self:2fa:manage',
  'self:sessions:read',
  'self:sessions:revoke',
  'self:devices:read',
  'self:devices:manage',
  'self:identities:read',
  'self:identities:manage',
];

// API key self scopes (only granted if app allows user API keys)
export const USER_API_KEY_SCOPES: string[] = [
  'self:api-keys:read',
  'self:api-keys:write',
  'self:api-keys:revoke',
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get scopes for a platform role
 */
export function getPlatformRoleScopes(roleType: PlatformRoleType): string[] {
  return PLATFORM_ROLE_SCOPES[roleType] || [];
}

/**
 * Get scopes for an organization role
 */
export function getOrgRoleScopes(roleType: OrgRoleType): string[] {
  return ORG_ROLE_SCOPES[roleType] || [];
}

/**
 * Get scopes for an app role
 */
export function getAppRoleScopes(roleType: AppRoleType): string[] {
  return APP_ROLE_SCOPES[roleType] || [];
}

/**
 * Check if a role has a wildcard scope
 */
export function hasWildcardScope(scopes: string[]): boolean {
  return scopes.includes('*') ||
    scopes.some(s => s.endsWith(':*'));
}
