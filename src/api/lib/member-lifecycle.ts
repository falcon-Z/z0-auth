import { ErrorCodes } from "@z0/contracts/errors";
import { normalizeEmail } from "@z0/contracts/validation";

import { accountStatus, revokeConsoleAccountAccess } from "./account-lifecycle";
import { writeAuditEvent } from "./audit";
import { getDb } from "./db";
import { problem } from "./http";

export type MemberLifecycleAction = "disable" | "enable" | "unlock" | "delete" | "restore" | "permanently-delete";

export async function transitionInstanceMember(
  targetUserId: string,
  actorUserId: string,
  action: MemberLifecycleAction,
  confirmationEmail?: string,
): Promise<{ ok: true; permanentlyDeleted: boolean } | { ok: false; response: Response }> {
  const result = await getDb().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(7130011)`;
    const [row] = await tx`
      SELECT u.id, u.email, u.disabled_at, u.locked_until, u.deleted_at, m.is_bootstrap
      FROM instance_members m
      JOIN users u ON u.id = m.user_id
      WHERE u.id = ${targetUserId}
      FOR UPDATE
    `;
    if (!row) return { error: "not_found" as const };
    const member = row as {
      id: string;
      email: string;
      disabled_at: Date | null;
      locked_until: Date | null;
      deleted_at: Date | null;
      is_bootstrap: boolean;
    };
    const current = accountStatus(member);
    const removesAccess = action === "disable" || action === "delete" || action === "permanently-delete";
    if (removesAccess && targetUserId === actorUserId) return { error: "self" as const };
    if (removesAccess && member.is_bootstrap) return { error: "owner" as const };

    if (removesAccess && current !== "deleted") {
      const [countRow] = await tx`
        SELECT COUNT(*)::int AS n
        FROM instance_members m
        JOIN users u ON u.id = m.user_id
        WHERE u.deleted_at IS NULL
          AND u.disabled_at IS NULL
          AND (u.locked_until IS NULL OR u.locked_until <= NOW())
      `;
      if (Number((countRow as { n: number }).n) <= 1) return { error: "last_member" as const };
    }

    if (action === "permanently-delete") {
      if (current !== "deleted") return { error: "conflict" as const };
      if (normalizeEmail(confirmationEmail ?? "") !== member.email) return { error: "confirmation" as const };
      await writeAuditEvent({
        actorUserId,
        action: "console_member.permanently_deleted",
        resourceType: "console_member",
        resourceId: targetUserId,
      }, tx);
      await tx`DELETE FROM magic_link_tokens WHERE realm = 'console' AND lower(email) = ${member.email}`;
      await tx`DELETE FROM users WHERE id = ${targetUserId}`;
      return { error: null, permanentlyDeleted: true };
    }

    if (action === "disable") {
      if (current !== "active" && current !== "locked") return { error: "conflict" as const };
      await tx`
        UPDATE users SET status = 'disabled', disabled_at = NOW(), disabled_by_user_id = ${actorUserId}, updated_at = NOW()
        WHERE id = ${targetUserId}
      `;
      await revokeConsoleAccountAccess(tx, targetUserId, member.email);
      await writeAuditEvent({ actorUserId, action: "console_member.disabled", resourceType: "console_member", resourceId: targetUserId }, tx);
    } else if (action === "enable") {
      if (current !== "disabled" || member.deleted_at) return { error: "conflict" as const };
      await tx`
        UPDATE users SET status = 'active', disabled_at = NULL, disabled_by_user_id = NULL,
          locked_until = NULL, failed_sign_in_count = 0, failed_sign_in_window_started_at = NULL, updated_at = NOW()
        WHERE id = ${targetUserId}
      `;
      await writeAuditEvent({ actorUserId, action: "console_member.enabled", resourceType: "console_member", resourceId: targetUserId }, tx);
    } else if (action === "unlock") {
      if (current !== "locked") return { error: "conflict" as const };
      await tx`
        UPDATE users SET locked_until = NULL, failed_sign_in_count = 0,
          failed_sign_in_window_started_at = NULL, updated_at = NOW()
        WHERE id = ${targetUserId}
      `;
      await writeAuditEvent({ actorUserId, action: "console_member.unlocked", resourceType: "console_member", resourceId: targetUserId }, tx);
    } else if (action === "delete") {
      if (current === "deleted") return { error: "conflict" as const };
      await tx`
        UPDATE users SET status = 'disabled', deleted_at = NOW(), deleted_by_user_id = ${actorUserId},
          disabled_at = COALESCE(disabled_at, NOW()), disabled_by_user_id = COALESCE(disabled_by_user_id, ${actorUserId}),
          locked_until = NULL, failed_sign_in_count = 0, failed_sign_in_window_started_at = NULL, updated_at = NOW()
        WHERE id = ${targetUserId}
      `;
      await revokeConsoleAccountAccess(tx, targetUserId, member.email);
      await writeAuditEvent({ actorUserId, action: "console_member.deleted", resourceType: "console_member", resourceId: targetUserId }, tx);
    } else if (action === "restore") {
      if (current !== "deleted") return { error: "conflict" as const };
      await tx`
        UPDATE users SET status = 'disabled', deleted_at = NULL, deleted_by_user_id = NULL,
          disabled_at = NOW(), disabled_by_user_id = ${actorUserId}, locked_until = NULL,
          failed_sign_in_count = 0, failed_sign_in_window_started_at = NULL, updated_at = NOW()
        WHERE id = ${targetUserId}
      `;
      await writeAuditEvent({ actorUserId, action: "console_member.restored", resourceType: "console_member", resourceId: targetUserId, payload: { status: "disabled" } }, tx);
    }
    return { error: null, permanentlyDeleted: false };
  });

  if (result.error === "not_found") return { ok: false, response: problem(404, "Not Found", "Member not found", {
    errors: [{ field: "userId", code: ErrorCodes.USER_NOT_FOUND, message: "Member not found" }],
  }) };
  if (result.error === "self" || result.error === "owner" || result.error === "last_member") {
    const detail = result.error === "self"
      ? "You cannot suspend or delete your own console account."
      : result.error === "owner"
        ? "Transfer ownership before changing the owner account."
        : "At least one active console member is required.";
    return { ok: false, response: problem(409, "Conflict", detail, {
      errors: [{ field: "userId", code: ErrorCodes.PERMISSION_DENIED, message: detail }],
    }) };
  }
  if (result.error === "confirmation") return { ok: false, response: problem(400, "Validation Error", "Confirmation email does not match.", {
    errors: [{ field: "confirmationEmail", code: ErrorCodes.REQUIRED, message: "Type the member email exactly" }],
  }) };
  if (result.error === "conflict") return { ok: false, response: problem(409, "Conflict", "The account cannot make that state change.", {
    errors: [{ field: "status", code: ErrorCodes.ACCOUNT_STATE_CONFLICT, message: "Account state changed; reload and try again" }],
  }) };
  return { ok: true, permanentlyDeleted: result.permanentlyDeleted };
}
