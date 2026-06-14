import type { TransferOwnershipRequest } from "@z0/contracts/rbac";
import { ErrorCodes } from "@z0/contracts/errors";

import { writeAuditEvent } from "./audit";
import { getDb } from "./db";
import { problem } from "./http";
import { isBootstrapMember } from "./instance-members";
import {
  getAdminRoleId,
  getOwnerRoleId,
  memberHasScope,
} from "./platform-rbac";

export async function transferInstanceOwnership(
  actorUserId: string,
  body: TransferOwnershipRequest,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!(await isBootstrapMember(actorUserId))) {
    return {
      ok: false,
      response: problem(403, "Forbidden", "Only the owner can transfer ownership", {
        errors: [
          {
            field: "_auth",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "Only the instance owner can transfer ownership",
          },
        ],
      }),
    };
  }

  if (!(await memberHasScope(actorUserId, "ownership:transfer"))) {
    return {
      ok: false,
      response: problem(403, "Forbidden", "You do not have permission to transfer ownership", {
        errors: [
          {
            field: "_auth",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "Missing ownership transfer permission",
          },
        ],
      }),
    };
  }

  const targetUserId = body.targetUserId?.trim();
  if (!targetUserId) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Choose a team member", {
        errors: [{ field: "targetUserId", code: ErrorCodes.REQUIRED, message: "Target member is required" }],
      }),
    };
  }

  if (targetUserId === actorUserId) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Choose someone else to become owner", {
        errors: [
          {
            field: "targetUserId",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "You are already the owner",
          },
        ],
      }),
    };
  }

  const [targetMember] = await getDb()`
    SELECT m.user_id
    FROM instance_members m
    JOIN users u ON u.id = m.user_id AND u.status = 'active'
    WHERE m.user_id = ${targetUserId}
  `;
  if (!targetMember) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Member not found", {
        errors: [{ field: "targetUserId", code: ErrorCodes.USER_NOT_FOUND, message: "Not a team member" }],
      }),
    };
  }

  const ownerRoleId = await getOwnerRoleId();
  const previousOwnerRoleId = body.previousOwnerRoleId?.trim() || (await getAdminRoleId());

  const [previousRole] = await getDb()`
    SELECT id, is_system FROM instance_roles WHERE id = ${previousOwnerRoleId}
  `;
  if (!previousRole || String((previousRole as { id: string }).id) === ownerRoleId) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Choose a valid role for your account after transfer", {
        errors: [
          {
            field: "previousOwnerRoleId",
            code: ErrorCodes.PERMISSION_DENIED,
            message: "Cannot assign the owner role to the previous owner automatically",
          },
        ],
      }),
    };
  }

  try {
    await getDb().begin(async (tx) => {
      const [actorRow] = await tx`
        SELECT user_id, is_bootstrap
        FROM instance_members
        WHERE user_id = ${actorUserId}
        FOR UPDATE
      `;
      if (!actorRow || !(actorRow as { is_bootstrap: boolean }).is_bootstrap) {
        throw new Error("ownership_actor_not_owner");
      }

      await tx`UPDATE instance_members SET is_bootstrap = false WHERE is_bootstrap = true`;
      await tx`
        UPDATE instance_members SET is_bootstrap = true WHERE user_id = ${targetUserId}
      `;
      await tx`DELETE FROM instance_member_roles WHERE member_user_id = ${targetUserId}`;
      await tx`
        INSERT INTO instance_member_roles (member_user_id, role_id, granted_by_user_id)
        VALUES (${targetUserId}, ${ownerRoleId}, ${actorUserId})
      `;
      await tx`DELETE FROM instance_member_roles WHERE member_user_id = ${actorUserId}`;
      await tx`
        INSERT INTO instance_member_roles (member_user_id, role_id, granted_by_user_id)
        VALUES (${actorUserId}, ${previousOwnerRoleId}, ${actorUserId})
      `;
      await writeAuditEvent(
        {
          actorUserId,
          action: "ownership.transferred",
          resourceType: "instance_member",
          resourceId: targetUserId,
          payload: { previousOwnerUserId: actorUserId, previousOwnerRoleId },
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ownership_actor_not_owner") {
      return {
        ok: false,
        response: problem(409, "Conflict", "Ownership has already changed", {
          errors: [
            {
              field: "_auth",
              code: ErrorCodes.PERMISSION_DENIED,
              message: "You are no longer the instance owner",
            },
          ],
        }),
      };
    }
    throw error;
  }

  return { ok: true };
}
