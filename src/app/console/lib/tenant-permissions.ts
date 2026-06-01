import type { SessionResponse } from "@z0/contracts/auth";

/** Mirrors role → permission seed in migration 0005. */
const TENANT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  tenant_admin: ["tenants:read", "users:read", "users:invite", "sessions:revoke"],
  tenant_manager: ["tenants:read", "users:read", "users:invite", "sessions:revoke"],
  tenant_member: ["tenants:read"],
};

const PLATFORM_ADMIN_ROLES = new Set(["platform_admin"]);

export function tenantPermissionsFromSession(session: SessionResponse): Set<string> {
  const permissions = new Set<string>();

  if (session.roles?.some((role) => PLATFORM_ADMIN_ROLES.has(role))) {
    permissions.add("platform:manage");
    permissions.add("tenants:create");
    permissions.add("users:read");
    permissions.add("users:invite");
    permissions.add("tenants:read");
    permissions.add("sessions:revoke");
    return permissions;
  }

  for (const role of session.tenantRoles ?? []) {
    for (const key of TENANT_ROLE_PERMISSIONS[role] ?? []) {
      permissions.add(key);
    }
  }

  return permissions;
}

export function sessionHasPermission(session: SessionResponse, permission: string): boolean {
  const permissions = tenantPermissionsFromSession(session);
  if (permissions.has("platform:manage")) return true;
  return permissions.has(permission);
}

export function formatRoleKey(key: string): string {
  return key.replace(/^tenant_/, "").replace(/_/g, " ");
}
