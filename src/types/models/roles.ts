/**
 * Role type definitions
 * Single source of truth for all role enums used across the application
 */

// Platform-level roles (super admin, org manager, etc.)
export type PlatformRoleType =
  | "SUPER_ADMIN"
  | "ORG_MANAGER"
  | "SECURITY_MANAGER"
  | "AUDITOR"
  | "SUPPORT_MANAGER";

// Organization-level roles
export type OrgRoleType =
  | "ORG_OWNER"
  | "ORG_ADMIN"
  | "ORG_DEVELOPER"
  | "ORG_MEMBER";

// Application-level roles
export type AppRoleType = "APP_OWNER" | "APP_MANAGER" | "APP_USER";

// Entity status types
export type OrganizationStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type UserStatus = "ACTIVE" | "INACTIVE" | "PENDING" | "SUSPENDED" | "DELETED";
export type AppStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";

// External provider types
export type ExternalProviderType = "OAUTH2" | "SAML" | "OIDC" | "LDAP" | "CUSTOM";

// Role labels for display
export const ORG_ROLE_LABELS: Record<OrgRoleType, string> = {
  ORG_OWNER: "Owner",
  ORG_ADMIN: "Admin",
  ORG_DEVELOPER: "Developer",
  ORG_MEMBER: "Member",
};

export const PLATFORM_ROLE_LABELS: Record<PlatformRoleType, string> = {
  SUPER_ADMIN: "Super Admin",
  ORG_MANAGER: "Organization Manager",
  SECURITY_MANAGER: "Security Manager",
  AUDITOR: "Auditor",
  SUPPORT_MANAGER: "Support Manager",
};

export const APP_ROLE_LABELS: Record<AppRoleType, string> = {
  APP_OWNER: "Owner",
  APP_MANAGER: "Manager",
  APP_USER: "User",
};

export const STATUS_LABELS: Record<OrganizationStatus | UserStatus | AppStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
  PENDING: "Pending",
  DELETED: "Deleted",
};
