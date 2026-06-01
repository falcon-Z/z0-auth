/** Fixed tenant role catalog (v1). */
export const TENANT_ROLE_KEYS = ["tenant_admin", "tenant_manager", "tenant_member"] as const;

export type TenantRoleKey = (typeof TENANT_ROLE_KEYS)[number];

/** Roles an actor may assign when inviting or editing members. */
export function assignableTenantRoles(actorTenantRoleKeys: readonly string[]): readonly string[] {
  if (actorTenantRoleKeys.includes("tenant_admin")) {
    return TENANT_ROLE_KEYS;
  }
  if (actorTenantRoleKeys.includes("tenant_manager")) {
    return ["tenant_member", "tenant_manager"];
  }
  return [];
}

export function canAssignTenantRoles(
  actorTenantRoleKeys: readonly string[],
  targetRoleKeys: readonly string[],
  options?: { platformUserWrite?: boolean },
): boolean {
  const allowed = new Set(
    actorTenantRoleKeys.length > 0
      ? assignableTenantRoles(actorTenantRoleKeys)
      : options?.platformUserWrite
        ? TENANT_ROLE_KEYS
        : [],
  );
  if (!targetRoleKeys.length) return false;
  return targetRoleKeys.every((key) => allowed.has(key));
}

export function roleKeysIncludeTenantAdmin(roleKeys: readonly string[]): boolean {
  return roleKeys.includes("tenant_admin");
}
