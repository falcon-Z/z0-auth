import type { SetMemberRolesRequest } from "@z0/contracts/rbac";
import { ErrorCodes } from "@z0/contracts/errors";

import { writeAuditEvent } from "./audit";
import { getDb } from "./db";
import { problem } from "./http";
import { isBootstrapMember } from "./instance-members";
import {
  assignMemberRoles,
  getMemberRoleSummaries,
  getOwnerRoleId,
  grantBoundaryViolationForRoleIds,
} from "./platform-rbac";

export async function setMemberRoles(
  targetUserId: string,
  body: SetMemberRolesRequest,
  actorUserId: string,
): Promise<
  | { ok: true; roles: Awaited<ReturnType<typeof getMemberRoleSummaries>> }
  | { ok: false; response: Response }
> {
  const roleIds = [...new Set(body.roleIds ?? [])];
  if (roleIds.length === 0) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Choose at least one role", {
        errors: [{ field: "roleIds", code: ErrorCodes.REQUIRED, message: "At least one role is required" }],
      }),
    };
  }

  const [member] = await getDb()`
    SELECT user_id FROM instance_members WHERE user_id = ${targetUserId}
  `;
  if (!member) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Member not found", {
        errors: [{ field: "userId", code: ErrorCodes.USER_NOT_FOUND, message: "Not a team member" }],
      }),
    };
  }

  if (await isBootstrapMember(targetUserId)) {
    return {
      ok: false,
      response: problem(409, "Conflict", "The owner role is managed through ownership transfer", {
        errors: [
          {
            field: "userId",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "Cannot change roles for the instance owner",
          },
        ],
      }),
    };
  }

  const ownerRoleId = await getOwnerRoleId();
  if (roleIds.includes(ownerRoleId)) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "The owner role cannot be assigned manually", {
        errors: [
          {
            field: "roleIds",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "Use ownership transfer to change the owner",
          },
        ],
      }),
    };
  }

  for (const roleId of roleIds) {
    const [row] = await getDb()`SELECT id FROM instance_roles WHERE id = ${roleId} LIMIT 1`;
    if (!row) {
      return {
        ok: false,
        response: problem(400, "Validation Error", "One or more roles are invalid", {
          errors: [{ field: "roleIds", code: ErrorCodes.USER_NOT_FOUND, message: "Unknown role" }],
        }),
      };
    }
  }

  const boundary = await grantBoundaryViolationForRoleIds(actorUserId, roleIds, "roleIds");
  if (boundary) return { ok: false, response: boundary };

  await assignMemberRoles(targetUserId, roleIds, actorUserId);
  await writeAuditEvent({
    actorUserId,
    action: "member.roles_updated",
    resourceType: "instance_member",
    resourceId: targetUserId,
    payload: { roleIds },
  });

  const roles = await getMemberRoleSummaries(targetUserId);
  return { ok: true, roles };
}

export async function getMemberRolesForApi(userId: string) {
  const [member] = await getDb()`
    SELECT user_id FROM instance_members WHERE user_id = ${userId}
  `;
  if (!member) return null;
  const roles = await getMemberRoleSummaries(userId);
  return { userId, roles };
}
