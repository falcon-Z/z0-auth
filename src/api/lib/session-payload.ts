import type { AuthenticatedSessionPayload, SessionResponse } from "@z0/contracts/auth";

import { getUserById } from "./auth";
import { listPlatformPermissionKeys, listUserPermissionKeys } from "./permissions";
import { getPlatformRoleKeys, getTenantRoleKeys } from "./roles";
import { listUserTenants, resolveActiveTenant, type Tenant } from "./tenant";

function tenantToOrganization(tenant: Tenant) {
  return { id: tenant.id, name: tenant.name, slug: tenant.slug };
}

export async function buildAuthenticatedSessionPayload(userId: string): Promise<SessionResponse> {
  const user = await getUserById(userId);
  if (!user) {
    return { authenticated: false };
  }

  const roles = await getPlatformRoleKeys(userId);
  const organizations = (await listUserTenants(userId)).map(tenantToOrganization);
  const activeTenant = await resolveActiveTenant(userId);
  const tenant = activeTenant ? tenantToOrganization(activeTenant) : undefined;
  const tenantRoles = activeTenant ? await getTenantRoleKeys(userId, activeTenant.id) : [];
  const canSwitchOrganization = organizations.length > 1;
  const permissions = activeTenant
    ? await listUserPermissionKeys(userId, activeTenant.id)
    : await listPlatformPermissionKeys(userId);

  const payload: AuthenticatedSessionPayload = {
    authenticated: true,
    user,
    roles,
    tenantRoles,
    organizations,
    canSwitchOrganization,
    permissions,
  };
  if (tenant) payload.tenant = tenant;
  return payload;
}
