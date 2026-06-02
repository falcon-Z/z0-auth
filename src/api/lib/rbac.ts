import { ErrorCodes } from "@z0/contracts/errors";
import {
  assignableTenantRoles,
  canAssignTenantRoles,
  roleKeysIncludeTenantAdmin,
  TENANT_ROLE_KEYS,
} from "@z0/lib/rbac/tenant-roles";

import { getDb } from "./db";
import { problem } from "./http";
import { userHasPermission } from "./permissions";
import { getTenantRoleKeys } from "./roles";

export async function assignableTenantRoleKeysForActor(
  actorUserId: string,
  tenantId: string,
): Promise<string[]> {
  const tenantRoles = await getTenantRoleKeys(actorUserId, tenantId);
  const platformUserWrite = await userHasPermission(actorUserId, "platform:users:write");
  const platformTenantManage = await userHasPermission(actorUserId, "platform:tenants:manage");
  if (platformTenantManage) {
    return [...TENANT_ROLE_KEYS];
  }
  if (tenantRoles.length > 0) {
    return [...assignableTenantRoles(tenantRoles)];
  }
  if (platformUserWrite) {
    return [...TENANT_ROLE_KEYS];
  }
  return [];
}

export async function assertCanAssignTenantRoles(
  actorUserId: string,
  tenantId: string,
  targetRoleKeys: string[],
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const tenantRoles = await getTenantRoleKeys(actorUserId, tenantId);
  const platformUserWrite = await userHasPermission(actorUserId, "platform:users:write");
  const platformTenantManage = await userHasPermission(actorUserId, "platform:tenants:manage");
  const canAssign = platformTenantManage || canAssignTenantRoles(tenantRoles, targetRoleKeys, { platformUserWrite });
  if (!canAssign) {
    return {
      ok: false,
      response: problem(403, "Forbidden", "You cannot assign one or more of these roles", {
        errors: [
          {
            field: "roleKeys",
            code: ErrorCodes.ROLE_ASSIGNMENT_DENIED,
            message: "You cannot assign one or more of these roles",
          },
        ],
      }),
    };
  }
  return { ok: true };
}

export async function countTenantAdmins(tenantId: string): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(DISTINCT ur.user_id)::int AS n
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id AND r.key = 'tenant_admin' AND r.scope = 'tenant'
    WHERE ur.tenant_id = ${tenantId}
  `;
  return Number((row as { n: number } | undefined)?.n ?? 0);
}

export async function targetIsTenantAdmin(userId: string, tenantId: string): Promise<boolean> {
  const roles = await getTenantRoleKeys(userId, tenantId);
  return roles.includes("tenant_admin");
}

export async function assertNotLastTenantAdmin(
  tenantId: string,
  targetUserId: string,
  nextRoleKeys?: string[],
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const isAdmin = await targetIsTenantAdmin(targetUserId, tenantId);
  if (!isAdmin) return { ok: true };

  const willRemainAdmin =
    nextRoleKeys === undefined ? false : roleKeysIncludeTenantAdmin(nextRoleKeys);
  if (willRemainAdmin) return { ok: true };

  const adminCount = await countTenantAdmins(tenantId);
  if (adminCount <= 1) {
    return {
      ok: false,
      response: problem(403, "Forbidden", "Cannot remove the last administrator from this organization", {
        errors: [
          {
            field: "roleKeys",
            code: ErrorCodes.LAST_TENANT_ADMIN,
            message: "Cannot remove the last administrator from this organization",
          },
        ],
      }),
    };
  }
  return { ok: true };
}
