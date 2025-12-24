/**
 * System-wide scope definitions
 * Format: {level}:{resource}:{action}
 *
 * Levels: platform, org, app, self
 * Actions: read, write, delete, manage
 */

// =============================================================================
// Platform Scopes - Access to platform-wide resources
// =============================================================================

export const PLATFORM_SCOPES = {
  // Organizations
  'platform:organizations:read': 'View all organizations',
  'platform:organizations:write': 'Create and update organizations',
  'platform:organizations:delete': 'Delete organizations',
  'platform:organizations:manage': 'Full organization management',

  // Platform Settings
  'platform:settings:read': 'View platform settings',
  'platform:settings:write': 'Modify platform settings',

  // Audit
  'platform:audit:read': 'View audit logs',
  'platform:audit:export': 'Export audit logs',

  // Security
  'platform:security:read': 'View security settings',
  'platform:security:write': 'Modify security settings',
  'platform:security:lockouts:manage': 'Manage account lockouts',

  // Users (platform-wide view)
  'platform:users:read': 'View all users across platform',
  'platform:users:write': 'Modify users across platform',

  // System Scopes
  'platform:scopes:read': 'View system scopes',
} as const;

// =============================================================================
// Organization Scopes - Access to organization resources
// =============================================================================

export const ORG_SCOPES = {
  // Apps
  'org:apps:read': 'View organization apps',
  'org:apps:write': 'Create and update apps',
  'org:apps:delete': 'Delete apps',
  'org:apps:manage': 'Full app management',

  // Members
  'org:members:read': 'View organization members',
  'org:members:invite': 'Invite new members',
  'org:members:write': 'Update member details',
  'org:members:remove': 'Remove members',
  'org:members:manage': 'Full member management',

  // Settings
  'org:settings:read': 'View organization settings',
  'org:settings:write': 'Modify organization settings',

  // Roles & Scopes
  'org:roles:read': 'View custom roles',
  'org:roles:write': 'Create and update custom roles',
  'org:roles:delete': 'Delete custom roles',
  'org:roles:manage': 'Full role management',
  'org:scopes:read': 'View organization scopes',
  'org:scopes:write': 'Create and update scopes',
  'org:scopes:manage': 'Full scope management',

  // External Providers
  'org:providers:read': 'View OAuth/SAML providers',
  'org:providers:write': 'Configure external providers',

  // API Keys
  'org:api-keys:read': 'View organization API keys',
  'org:api-keys:write': 'Create and manage API keys',
  'org:api-keys:rotate': 'Rotate API keys',
  'org:api-keys:revoke': 'Revoke API keys',
} as const;

// =============================================================================
// App Scopes - Access to app resources
// =============================================================================

export const APP_SCOPES = {
  // Settings
  'app:settings:read': 'View app settings',
  'app:settings:write': 'Modify app settings',

  // Users
  'app:users:read': 'View app users',
  'app:users:write': 'Add and update app users',
  'app:users:remove': 'Remove app users',
  'app:users:manage': 'Full app user management',

  // Sessions
  'app:sessions:read': 'View app sessions',
  'app:sessions:revoke': 'Revoke app sessions',

  // API Keys
  'app:api-keys:read': 'View app API keys',
  'app:api-keys:write': 'Create app API keys',
  'app:api-keys:manage': 'Full API key management',

  // Custom Scopes
  'app:scopes:read': 'View custom app scopes',
  'app:scopes:write': 'Define custom app scopes',
  'app:scopes:assign': 'Assign scopes to users',
} as const;

// =============================================================================
// Self Scopes - User's access to their own resources
// =============================================================================

export const SELF_SCOPES = {
  // Profile
  'self:profile:read': 'View own profile',
  'self:profile:write': 'Update own profile',

  // Credentials
  'self:credentials:read': 'View own credential status',
  'self:credentials:write': 'Change own password',

  // 2FA
  'self:2fa:read': 'View own 2FA status',
  'self:2fa:manage': 'Enable/disable own 2FA',

  // Sessions
  'self:sessions:read': 'View own active sessions',
  'self:sessions:revoke': 'Revoke own sessions',

  // Devices
  'self:devices:read': 'View own trusted devices',
  'self:devices:manage': 'Manage own trusted devices',

  // API Keys (if allowed by app)
  'self:api-keys:read': 'View own API keys',
  'self:api-keys:write': 'Create own API keys',
  'self:api-keys:revoke': 'Revoke own API keys',

  // External Identities
  'self:identities:read': 'View linked external accounts',
  'self:identities:manage': 'Link/unlink external accounts',
} as const;

// =============================================================================
// All Scopes Combined
// =============================================================================

export const ALL_SCOPES = {
  ...PLATFORM_SCOPES,
  ...ORG_SCOPES,
  ...APP_SCOPES,
  ...SELF_SCOPES,
} as const;

// Type exports
export type PlatformScope = keyof typeof PLATFORM_SCOPES;
export type OrgScope = keyof typeof ORG_SCOPES;
export type AppScope = keyof typeof APP_SCOPES;
export type SelfScope = keyof typeof SELF_SCOPES;
export type SystemScope = keyof typeof ALL_SCOPES;

// Scope categories
export const SCOPE_CATEGORIES = ['platform', 'org', 'app', 'self'] as const;
export type ScopeCategory = typeof SCOPE_CATEGORIES[number];

// Extract scope info from scope name
export function parseScopeName(scope: string): {
  category: string;
  resource: string;
  action: string;
} | null {
  const parts = scope.split(':');
  if (parts.length !== 3) return null;

  return {
    category: parts[0],
    resource: parts[1],
    action: parts[2],
  };
}
