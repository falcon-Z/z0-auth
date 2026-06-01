import type { SessionResponse } from "@z0/contracts/auth";

import { assignableTenantRoles } from "@z0/lib/rbac/tenant-roles";

/** Fallback when session.permissions is absent (e.g. older tests). Mirrors migration 0008 seeds. */
const TENANT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  tenant_admin: ["tenants:read", "users:read", "users:invite", "sessions:revoke"],
  tenant_manager: ["tenants:read", "users:read", "users:invite", "sessions:revoke"],
  tenant_member: ["tenants:read"],
};

const PLATFORM_ADMIN_PERMISSIONS = [
  "platform:users:read",
  "platform:users:write",
  "platform:sessions:revoke",
  "platform:tenants:read",
  "tenants:create",
  "tenants:read",
  "users:read",
  "users:invite",
  "sessions:revoke",
] as const;

export function tenantPermissionsFromSession(session: SessionResponse): Set<string> {
  if (session.permissions?.length) {
    return new Set(session.permissions);
  }

  const permissions = new Set<string>();

  if (session.roles?.includes("platform_admin")) {
    for (const key of PLATFORM_ADMIN_PERMISSIONS) {
      permissions.add(key);
    }
    return permissions;
  }

  if (session.roles?.includes("platform_manager")) {
    permissions.add("platform:users:read");
    permissions.add("platform:tenants:read");
    permissions.add("platform:sessions:revoke");
  }

  for (const role of session.tenantRoles ?? []) {
    for (const key of TENANT_ROLE_PERMISSIONS[role] ?? []) {
      permissions.add(key);
    }
  }

  return permissions;
}

export function sessionHasPermission(session: SessionResponse, permission: string): boolean {
  return tenantPermissionsFromSession(session).has(permission);
}

export function assignableRolesFromSession(session: SessionResponse): readonly string[] {
  if (session.roles?.includes("platform_admin")) {
    return assignableTenantRoles(["tenant_admin"]);
  }
  if (session.permissions?.includes("platform:users:write")) {
    return assignableTenantRoles(["tenant_admin"]);
  }
  return assignableTenantRoles(session.tenantRoles ?? []);
}

export function formatRoleKey(key: string): string {
  return key.replace(/^tenant_/, "").replace(/_/g, " ");
}
