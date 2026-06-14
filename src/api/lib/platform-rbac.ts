import type { SQL } from "bun";

import { ErrorCodes } from "@z0/contracts/errors";
import type { PlatformResource, PlatformScope } from "@z0/contracts/rbac";

import { getDb } from "./db";
import { problem } from "./http";
import { isBootstrapMember, requireInstanceMember } from "./instance-members";

export const OWNER_ROLE_KEY = "owner";

export { requireInstanceMember };

export async function getMemberScopeKeys(userId: string): Promise<string[]> {
  if (await isBootstrapMember(userId)) {
    const rows = await getDb()`SELECT key FROM platform_scopes ORDER BY key`;
    return rows.map((row) => String((row as { key: string }).key));
  }

  const rows = await getDb()`
    SELECT DISTINCT rs.scope_key
    FROM instance_member_roles mr
    JOIN instance_role_scopes rs ON rs.role_id = mr.role_id
    WHERE mr.member_user_id = ${userId}
    ORDER BY rs.scope_key
  `;
  return rows.map((row) => String((row as { scope_key: string }).scope_key));
}

export async function memberHasScope(userId: string, scopeKey: string): Promise<boolean> {
  const scopes = await getMemberScopeKeys(userId);
  return scopes.includes(scopeKey);
}

export async function getScopeKeysForRoleIds(roleIds: string[], db: SQL = getDb()): Promise<string[]> {
  const keys = new Set<string>();
  for (const roleId of roleIds) {
    const rows = await db`
      SELECT scope_key FROM instance_role_scopes WHERE role_id = ${roleId}
    `;
    for (const row of rows) {
      keys.add(String((row as { scope_key: string }).scope_key));
    }
  }
  return [...keys];
}

/** Returns a 403 response when the actor tries to grant scopes they do not hold. Bootstrap owner is exempt. */
export async function grantBoundaryViolation(
  actorUserId: string,
  requestedScopeKeys: string[],
  field = "_auth",
): Promise<Response | null> {
  if (await isBootstrapMember(actorUserId)) return null;
  const actorScopes = new Set(await getMemberScopeKeys(actorUserId));
  const missing = [...new Set(requestedScopeKeys)].filter((key) => !actorScopes.has(key));
  if (missing.length === 0) return null;
  return problem(403, "Forbidden", "You cannot grant permissions you do not hold", {
    errors: [
      {
        field,
        code: ErrorCodes.PERMISSION_DENIED,
        message: "Grant exceeds your access",
      },
    ],
  });
}

export async function grantBoundaryViolationForRoleIds(
  actorUserId: string,
  roleIds: string[],
  field = "roleIds",
  db: SQL = getDb(),
): Promise<Response | null> {
  const scopeKeys = await getScopeKeysForRoleIds(roleIds, db);
  return grantBoundaryViolation(actorUserId, scopeKeys, field);
}

export async function requireScope(
  req: Request,
  scopeKey: string,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth;

  if (!(await memberHasScope(auth.userId, scopeKey))) {
    return {
      ok: false,
      response: problem(403, "Forbidden", "You do not have permission for this action", {
        errors: [
          {
            field: "_auth",
            code: ErrorCodes.PERMISSION_DENIED,
            message: `Missing scope: ${scopeKey}`,
          },
        ],
      }),
    };
  }

  return { ok: true, userId: auth.userId };
}

export async function listPlatformResources(): Promise<PlatformResource[]> {
  const resourceRows = await getDb()`
    SELECT key, parent_key, label
    FROM platform_resources
    ORDER BY sort_order, key
  `;
  const scopeRows = await getDb()`
    SELECT key, resource_key, action, label, description
    FROM platform_scopes
    ORDER BY key
  `;

  const scopesByResource = new Map<string, PlatformScope[]>();
  for (const row of scopeRows) {
    const s = row as {
      key: string;
      resource_key: string;
      action: string;
      label: string;
      description: string;
    };
    const list = scopesByResource.get(s.resource_key) ?? [];
    list.push({
      key: s.key,
      resourceKey: s.resource_key,
      action: s.action,
      label: s.label,
      description: s.description,
    });
    scopesByResource.set(s.resource_key, list);
  }

  return resourceRows.map((row) => {
    const r = row as { key: string; parent_key: string | null; label: string };
    return {
      key: r.key,
      parentKey: r.parent_key,
      label: r.label,
      scopes: scopesByResource.get(r.key) ?? [],
    };
  });
}

export async function getRoleIdByKey(key: string, db: SQL = getDb()): Promise<string> {
  const [row] = await db`
    SELECT id FROM instance_roles WHERE key = ${key} LIMIT 1
  `;
  if (!row) throw new Error(`Role ${key} is not configured`);
  return String((row as { id: string }).id);
}

export async function getOwnerRoleId(db: SQL = getDb()): Promise<string> {
  return getRoleIdByKey(OWNER_ROLE_KEY, db);
}

export async function getDeveloperRoleId(db: SQL = getDb()): Promise<string> {
  return getRoleIdByKey("developer", db);
}

export async function getAdminRoleId(db: SQL = getDb()): Promise<string> {
  return getRoleIdByKey("admin", db);
}

async function replaceMemberRoles(
  db: SQL,
  memberUserId: string,
  roleIds: string[],
  grantedByUserId: string,
): Promise<void> {
  const uniqueRoleIds = [...new Set(roleIds)];
  if (uniqueRoleIds.length === 0) {
    throw new Error("At least one role is required");
  }

  const ownerRoleId = await getOwnerRoleId(db);
  if (uniqueRoleIds.includes(ownerRoleId)) {
    throw new Error("owner_role_not_assignable");
  }

  await db`DELETE FROM instance_member_roles WHERE member_user_id = ${memberUserId}`;
  for (const roleId of uniqueRoleIds) {
    await db`
      INSERT INTO instance_member_roles (member_user_id, role_id, granted_by_user_id)
      VALUES (${memberUserId}, ${roleId}, ${grantedByUserId})
    `;
  }
}

export async function assignMemberRoles(
  memberUserId: string,
  roleIds: string[],
  grantedByUserId: string,
): Promise<void> {
  await getDb().begin(async (tx) => {
    await replaceMemberRoles(tx, memberUserId, roleIds, grantedByUserId);
  });
}

export async function assignMemberRolesInTx(
  tx: SQL,
  memberUserId: string,
  roleIds: string[],
  grantedByUserId: string,
): Promise<void> {
  await replaceMemberRoles(tx, memberUserId, roleIds, grantedByUserId);
}

export async function assignInviteRoles(inviteId: string, roleIds: string[]): Promise<void> {
  await getDb().begin(async (tx) => {
    await assignInviteRolesInTx(tx, inviteId, roleIds);
  });
}

export async function assignInviteRolesInTx(tx: SQL, inviteId: string, roleIds: string[]): Promise<void> {
  const uniqueRoleIds = [...new Set(roleIds)];
  const ownerRoleId = await getOwnerRoleId(tx);
  const filtered = uniqueRoleIds.filter((id) => id !== ownerRoleId);
  if (filtered.length === 0) {
    throw new Error("invite_roles_required");
  }

  await tx`DELETE FROM instance_invite_roles WHERE invite_id = ${inviteId}`;
  for (const roleId of filtered) {
    await tx`
      INSERT INTO instance_invite_roles (invite_id, role_id)
      VALUES (${inviteId}, ${roleId})
    `;
  }
}

export async function applyInviteRolesToMember(
  inviteId: string,
  memberUserId: string,
  grantedByUserId: string | null,
  tx?: SQL,
): Promise<void> {
  const db = tx ?? getDb();
  const rows = await db`
    SELECT role_id FROM instance_invite_roles WHERE invite_id = ${inviteId}
  `;
  const roleIds = rows.map((row) => String((row as { role_id: string }).role_id));
  if (roleIds.length === 0) {
    throw new Error("invite_roles_missing");
  }
  const effectiveRoleIds = roleIds;
  const grantor = grantedByUserId ?? memberUserId;

  if (tx) {
    await assignMemberRolesInTx(tx, memberUserId, effectiveRoleIds, grantor);
    return;
  }
  await assignMemberRoles(memberUserId, effectiveRoleIds, grantor);
}

export async function assignBootstrapOwnerRole(userId: string): Promise<void> {
  await getDb().begin(async (tx) => {
    await assignBootstrapOwnerRoleInTx(tx, userId);
  });
}

export async function assignBootstrapOwnerRoleInTx(tx: SQL, userId: string): Promise<void> {
  const ownerRoleId = await getOwnerRoleId(tx);
  await tx`DELETE FROM instance_member_roles WHERE member_user_id = ${userId}`;
  await tx`
    INSERT INTO instance_member_roles (member_user_id, role_id, granted_by_user_id)
    VALUES (${userId}, ${ownerRoleId}, ${userId})
  `;
}

export async function getMemberRoleSummaries(userId: string) {
  const rows = await getDb()`
    SELECT
      r.id,
      r.key,
      r.name,
      r.description,
      r.is_system,
      (SELECT COUNT(*)::int FROM instance_role_scopes rs WHERE rs.role_id = r.id) AS scope_count,
      (SELECT COUNT(*)::int FROM instance_member_roles mr2 WHERE mr2.role_id = r.id) AS member_count
    FROM instance_member_roles mr
    JOIN instance_roles r ON r.id = mr.role_id
    WHERE mr.member_user_id = ${userId}
    ORDER BY r.name
  `;

  return rows.map((row) => {
    const r = row as {
      id: string;
      key: string;
      name: string;
      description: string;
      is_system: boolean;
      scope_count: number;
      member_count: number;
    };
    return {
      id: String(r.id),
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: Boolean(r.is_system),
      scopeCount: Number(r.scope_count),
      memberCount: Number(r.member_count),
    };
  });
}
