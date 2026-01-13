/**
 * Scopes Module
 *
 * Centralized scope management for the user-centric auth architecture.
 */

// Constants and definitions
export {
  PLATFORM_SCOPES,
  ORG_SCOPES,
  APP_SCOPES,
  SELF_SCOPES,
  ALL_SCOPES,
  SCOPE_CATEGORIES,
  parseScopeName,
  type PlatformScope,
  type OrgScope,
  type AppScope,
  type SelfScope,
  type SystemScope,
  type ScopeCategory,
} from './constants';

// Role to scope mappings
export {
  PLATFORM_ROLE_SCOPES,
  ORG_ROLE_SCOPES,
  APP_ROLE_SCOPES,
  DEFAULT_SELF_SCOPES,
  USER_API_KEY_SCOPES,
  getPlatformRoleScopes,
  getOrgRoleScopes,
  getAppRoleScopes,
  hasWildcardScope,
} from './role-mappings';

// Helper functions
export {
  hasScope,
  hasAnyScope,
  hasAllScopes,
  buildEffectiveScopes,
  getPlatformScopes,
  getOrgScopes,
  getAppScopes,
  isValidScopeFormat,
  filterScopesByLevel,
  expandWildcard,
  isManageScope,
  isWriteScope,
  isReadScope,
  getHighestPermissionLevel,
  type MembershipContext,
} from './helpers';
