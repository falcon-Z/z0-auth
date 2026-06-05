import type { BunRequest } from "bun";

import type { ChangePasswordRequest } from "@z0/contracts/auth";
import { ErrorCodes } from "@z0/contracts/errors";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@z0/contracts/password-policy";

import { getDb } from "./db";
import { problem } from "./http";
import { hashPassword, verifyPassword } from "./password";
import { revokeOtherUserSessions } from "./session";
import { writeAuditEvent } from "./audit";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; response: Response };

export async function changePassword(
  req: BunRequest,
  userId: string,
  sessionId: string,
  body: ChangePasswordRequest,
): Promise<ChangePasswordResult> {
  const currentPassword = body.currentPassword ?? "";
  const password = body.password ?? "";

  if (!currentPassword) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", {
        errors: [
          {
            field: "currentPassword",
            code: ErrorCodes.REQUIRED,
            message: "Current password is required",
          },
        ],
      }),
    };
  }

  const [row] = await getDb()`
    SELECT u.email, u.name, pc.password_hash
    FROM users u
    JOIN password_credentials pc ON pc.user_id = u.id
    WHERE u.id = ${userId} AND u.status = 'active'
  `;

  if (!row) {
    return {
      ok: false,
      response: problem(401, "Unauthorized", "Authentication required"),
    };
  }

  const user = row as { email: string; name: string; password_hash: string };
  const validCurrent = await verifyPassword(currentPassword, user.password_hash);
  if (!validCurrent) {
    return {
      ok: false,
      response: problem(401, "Unauthorized", "Current password is incorrect", {
        errors: [
          {
            field: "currentPassword",
            code: ErrorCodes.INVALID_CREDENTIALS,
            message: "Current password is incorrect",
          },
        ],
      }),
    };
  }

  const policyErrors = [
    ...validatePassword(password, { email: user.email, name: user.name }),
    ...validatePasswordConfirm(password, body.passwordConfirm ?? ""),
  ];
  if (policyErrors.length > 0) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", { errors: policyErrors }),
    };
  }

  const passwordHash = await hashPassword(password);
  await getDb()`
    UPDATE password_credentials
    SET password_hash = ${passwordHash}, updated_at = NOW()
    WHERE user_id = ${userId}
  `;

  await revokeOtherUserSessions(userId, sessionId);

  await writeAuditEvent({
    actorUserId: userId,
    action: "user.password_changed",
    resourceType: "user",
    resourceId: userId,
  });

  return { ok: true };
}
