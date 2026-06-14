import type {
  CreateRoleRequest,
  InstanceRoleDetail,
  InstanceRoleSummary,
  PatchRoleRequest,
} from "@z0/contracts/rbac";
import { ErrorCodes } from "@z0/contracts/errors";
import { validateRequiredString } from "@z0/contracts/validation";

import { writeAuditEvent } from "./audit";
import { getDb, pgTextArray } from "./db";
import { problem } from "./http";
import { getOwnerRoleId, grantBoundaryViolation, OWNER_ROLE_KEY } from "./platform-rbac";

function mapRoleSummary(row: {
  id: string;
  key: string;
  name: string;
  description: string;
  is_system: boolean;
  scope_count: number;
  member_count: number;
}): InstanceRoleSummary {
  return {
    id: String(row.id),
    key: row.key,
    name: row.name,
    description: row.description,
    isSystem: Boolean(row.is_system),
    scopeCount: Number(row.scope_count),
    memberCount: Number(row.member_count),
  };
}

export async function listInstanceRoles(): Promise<InstanceRoleSummary[]> {
  const rows = await getDb()`
    SELECT
      r.id,
      r.key,
      r.name,
      r.description,
      r.is_system,
      (SELECT COUNT(*)::int FROM instance_role_scopes rs WHERE rs.role_id = r.id) AS scope_count,
      (SELECT COUNT(*)::int FROM instance_member_roles mr WHERE mr.role_id = r.id) AS member_count
    FROM instance_roles r
    ORDER BY r.is_system DESC, r.name ASC
  `;
  return rows.map((row) => mapRoleSummary(row as Parameters<typeof mapRoleSummary>[0]));
}

export async function getInstanceRole(roleId: string): Promise<InstanceRoleDetail | null> {
  const [row] = await getDb()`
    SELECT
      r.id,
      r.key,
      r.name,
      r.description,
      r.is_system,
      (SELECT COUNT(*)::int FROM instance_role_scopes rs WHERE rs.role_id = r.id) AS scope_count,
      (SELECT COUNT(*)::int FROM instance_member_roles mr WHERE mr.role_id = r.id) AS member_count
    FROM instance_roles r
    WHERE r.id = ${roleId}
  `;
  if (!row) return null;

  const scopeRows = await getDb()`
    SELECT scope_key FROM instance_role_scopes WHERE role_id = ${roleId} ORDER BY scope_key
  `;

  const r = row as Parameters<typeof mapRoleSummary>[0];
  return {
    ...mapRoleSummary(r),
    scopeKeys: scopeRows.map((s) => String((s as { scope_key: string }).scope_key)),
  };
}

async function validateScopeKeys(
  scopeKeys: string[],
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (scopeKeys.length === 0) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Choose at least one permission", {
        errors: [{ field: "scopeKeys", code: ErrorCodes.REQUIRED, message: "At least one scope is required" }],
      }),
    };
  }

  const ownerRoleId = await getOwnerRoleId();
  const [ownerScopes] = await getDb()`
    SELECT scope_key FROM instance_role_scopes WHERE role_id = ${ownerRoleId} AND scope_key = 'ownership:transfer'
  `;
  void ownerScopes;

  const [countRow] = await getDb()`
    SELECT COUNT(*)::int AS n FROM platform_scopes WHERE key = ANY(${pgTextArray(scopeKeys)})
  `;
  if (Number((countRow as { n: number }).n) !== scopeKeys.length) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Unknown permission scope", {
        errors: [{ field: "scopeKeys", code: ErrorCodes.INVALID_SCOPE, message: "One or more scopes are invalid" }],
      }),
    };
  }

  if (scopeKeys.includes("ownership:transfer")) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Ownership transfer cannot be granted through a custom role", {
        errors: [
          {
            field: "scopeKeys",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "ownership:transfer is reserved for the owner role",
          },
        ],
      }),
    };
  }

  const boundary = await grantBoundaryViolation(actorUserId, scopeKeys, "scopeKeys");
  if (boundary) return { ok: false, response: boundary };

  return { ok: true };
}

export async function createInstanceRole(
  body: CreateRoleRequest,
  actorUserId: string,
): Promise<{ ok: true; role: InstanceRoleDetail } | { ok: false; response: Response }> {
  const errors = [...validateRequiredString(body.name, "name", "Name")];
  if (errors.length) {
    return { ok: false, response: problem(400, "Validation Error", "Invalid role request", { errors }) };
  }

  const scopeKeys = [...new Set(body.scopeKeys ?? [])];
  const scopeCheck = await validateScopeKeys(scopeKeys, actorUserId);
  if (!scopeCheck.ok) return scopeCheck;

  const name = body.name.trim();
  const description = (body.description ?? "").trim();
  const key = `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "role"}_${Date.now()}`;

  try {
    const roleId = await getDb().begin(async (tx) => {
      const [inserted] = await tx`
        INSERT INTO instance_roles (key, name, description, is_system)
        VALUES (${key}, ${name}, ${description}, false)
        RETURNING id
      `;
      const id = String((inserted as { id: string }).id);
      for (const scopeKey of scopeKeys) {
        await tx`
          INSERT INTO instance_role_scopes (role_id, scope_key)
          VALUES (${id}, ${scopeKey})
        `;
      }
      await writeAuditEvent(
        {
          actorUserId,
          action: "role.created",
          resourceType: "instance_role",
          resourceId: id,
          payload: { name, scopeCount: scopeKeys.length },
        },
        tx,
      );
      return id;
    });

    const role = await getInstanceRole(roleId);
    if (!role) throw new Error("Role creation failed");
    return { ok: true, role };
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
      return {
        ok: false,
        response: problem(409, "Conflict", "A role with this name already exists", {
          errors: [{ field: "name", code: ErrorCodes.SLUG_TAKEN, message: "Role name already in use" }],
        }),
      };
    }
    throw error;
  }
}

export async function patchInstanceRole(
  roleId: string,
  body: PatchRoleRequest,
  actorUserId: string,
): Promise<{ ok: true; role: InstanceRoleDetail } | { ok: false; response: Response }> {
  const existing = await getInstanceRole(roleId);
  if (!existing) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Role not found", {
        errors: [{ field: "roleId", code: ErrorCodes.USER_NOT_FOUND, message: "Role not found" }],
      }),
    };
  }

  if (existing.isSystem) {
    return {
      ok: false,
      response: problem(409, "Conflict", "System roles cannot be edited", {
        errors: [{ field: "roleId", code: ErrorCodes.PERMISSION_DENIED, message: "System role is read-only" }],
      }),
    };
  }

  if (existing.key === OWNER_ROLE_KEY) {
    return {
      ok: false,
      response: problem(409, "Conflict", "The owner role cannot be edited", {
        errors: [{ field: "roleId", code: ErrorCodes.PERMISSION_DENIED, message: "Owner role is read-only" }],
      }),
    };
  }

  const name = body.name?.trim() ?? existing.name;
  const description = body.description?.trim() ?? existing.description;
  const scopeKeys = body.scopeKeys ? [...new Set(body.scopeKeys)] : existing.scopeKeys;

  if (body.name !== undefined) {
    const errors = validateRequiredString(name, "name", "Name");
    if (errors.length) {
      return { ok: false, response: problem(400, "Validation Error", "Invalid role request", { errors }) };
    }
  }

  if (body.scopeKeys !== undefined) {
    const scopeCheck = await validateScopeKeys(scopeKeys, actorUserId);
    if (!scopeCheck.ok) return scopeCheck;
  }

  await getDb().begin(async (tx) => {
    await tx`
      UPDATE instance_roles
      SET name = ${name}, description = ${description}, updated_at = NOW()
      WHERE id = ${roleId}
    `;
    if (body.scopeKeys !== undefined) {
      await tx`DELETE FROM instance_role_scopes WHERE role_id = ${roleId}`;
      for (const scopeKey of scopeKeys) {
        await tx`
          INSERT INTO instance_role_scopes (role_id, scope_key)
          VALUES (${roleId}, ${scopeKey})
        `;
      }
    }
    await writeAuditEvent(
      {
        actorUserId,
        action: "role.updated",
        resourceType: "instance_role",
        resourceId: roleId,
        payload: { name },
      },
      tx,
    );
  });

  const role = await getInstanceRole(roleId);
  if (!role) throw new Error("Role update failed");
  return { ok: true, role };
}

export async function deleteInstanceRole(
  roleId: string,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const existing = await getInstanceRole(roleId);
  if (!existing) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Role not found", {
        errors: [{ field: "roleId", code: ErrorCodes.USER_NOT_FOUND, message: "Role not found" }],
      }),
    };
  }

  if (existing.isSystem) {
    return {
      ok: false,
      response: problem(409, "Conflict", "System roles cannot be deleted", {
        errors: [{ field: "roleId", code: ErrorCodes.PERMISSION_DENIED, message: "System role cannot be deleted" }],
      }),
    };
  }

  if (existing.memberCount > 0) {
    return {
      ok: false,
      response: problem(409, "Conflict", "Remove this role from all members before deleting it", {
        errors: [
          {
            field: "roleId",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "Role is still assigned to team members",
          },
        ],
      }),
    };
  }

  const [inviteCountRow] = await getDb()`
    SELECT COUNT(*)::int AS n FROM instance_invite_roles WHERE role_id = ${roleId}
  `;
  if (Number((inviteCountRow as { n: number }).n) > 0) {
    return {
      ok: false,
      response: problem(409, "Conflict", "Remove this role from pending invitations before deleting it", {
        errors: [
          {
            field: "roleId",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "Role is still assigned to pending invitations",
          },
        ],
      }),
    };
  }

  try {
    await getDb().begin(async (tx) => {
      const [memberCountRow] = await tx`
        SELECT COUNT(*)::int AS n FROM instance_member_roles WHERE role_id = ${roleId}
      `;
      if (Number((memberCountRow as { n: number }).n) > 0) {
        throw new Error("role_assigned_to_members");
      }

      const [inviteCountRow] = await tx`
        SELECT COUNT(*)::int AS n FROM instance_invite_roles WHERE role_id = ${roleId}
      `;
      if (Number((inviteCountRow as { n: number }).n) > 0) {
        throw new Error("role_assigned_to_invites");
      }

      await tx`DELETE FROM instance_roles WHERE id = ${roleId}`;
      await writeAuditEvent(
        {
          actorUserId,
          action: "role.deleted",
          resourceType: "instance_role",
          resourceId: roleId,
          payload: { name: existing.name },
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === "role_assigned_to_members") {
      return {
        ok: false,
        response: problem(409, "Conflict", "Remove this role from all members before deleting it", {
          errors: [
            {
              field: "roleId",
              code: ErrorCodes.PERMISSION_DENIED,
              message: "Role is still assigned to team members",
            },
          ],
        }),
      };
    }
    if (error instanceof Error && error.message === "role_assigned_to_invites") {
      return {
        ok: false,
        response: problem(409, "Conflict", "Remove this role from pending invitations before deleting it", {
          errors: [
            {
              field: "roleId",
              code: ErrorCodes.PERMISSION_DENIED,
              message: "Role is still assigned to pending invitations",
            },
          ],
        }),
      };
    }
    throw error;
  }

  return { ok: true };
}
