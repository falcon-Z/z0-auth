import type { BunRequest } from "bun";

import type { ChangePasswordRequest } from "@z0/contracts/auth";
import { ErrorCodes } from "@z0/contracts/errors";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@z0/contracts/password-policy";
import type {
  PatchPlatformUserRequest,
  PlatformUserDetail,
  PlatformUserSummary,
  UserStatus,
} from "@z0/contracts/users";

import { getDb } from "./db";
import { problem } from "./http";
import { hashPassword, verifyPassword } from "./password";
import { revokeAllUserSessions, revokeOtherUserSessions } from "./session";
import { writeAuditEvent } from "./audit";

type UserRow = {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  created_at: Date | string;
};

async function userIsInstanceMember(userId: string): Promise<boolean> {
  const [row] = await getDb()`SELECT 1 FROM instance_members WHERE user_id = ${userId} LIMIT 1`;
  return Boolean(row);
}

async function userBootstrapFlag(userId: string): Promise<boolean> {
  const [row] = await getDb()`
    SELECT is_bootstrap FROM instance_members WHERE user_id = ${userId}
  `;
  return Boolean((row as { is_bootstrap: boolean } | undefined)?.is_bootstrap);
}

function mapUserSummary(row: UserRow, isInstanceMember: boolean): PlatformUserSummary {
  return {
    id: String(row.id),
    email: row.email,
    name: row.name,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    isInstanceMember,
  };
}

export async function listPlatformUsers(): Promise<PlatformUserSummary[]> {
  const rows = await getDb()`
    SELECT id, email, name, status, created_at
    FROM users
    ORDER BY created_at ASC
  `;

  const users: PlatformUserSummary[] = [];
  for (const row of rows) {
    const userRow = row as UserRow;
    const id = String(userRow.id);
    users.push(mapUserSummary(userRow, await userIsInstanceMember(id)));
  }
  return users;
}

export async function getPlatformUser(userId: string): Promise<PlatformUserSummary | null> {
  const [row] = await getDb()`
    SELECT id, email, name, status, created_at
    FROM users
    WHERE id = ${userId}
  `;
  if (!row) return null;
  const userRow = row as UserRow;
  return mapUserSummary(userRow, await userIsInstanceMember(userId));
}

async function countUserActiveSessions(userId: string): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(*)::int AS count
    FROM sessions
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  return Number((row as { count: number }).count ?? 0);
}

export async function getPlatformUserDetail(userId: string): Promise<PlatformUserDetail | null> {
  const summary = await getPlatformUser(userId);
  if (!summary) return null;
  const activeSessionCount = await countUserActiveSessions(userId);
  const isBootstrap = summary.isInstanceMember ? await userBootstrapFlag(userId) : false;
  return { ...summary, activeSessionCount, isBootstrap };
}

async function countActiveInstanceMembers(): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(*)::int AS count
    FROM instance_members m
    JOIN users u ON u.id = m.user_id
    WHERE u.status = 'active'
  `;
  return Number((row as { count: number }).count ?? 0);
}

export type UpdateUserStatusResult =
  | { ok: true; user: PlatformUserSummary }
  | { ok: false; response: Response };

export async function updatePlatformUserStatus(
  actorUserId: string,
  targetUserId: string,
  body: PatchPlatformUserRequest,
): Promise<UpdateUserStatusResult> {
  const status = body.status;
  if (status !== "active" && status !== "disabled") {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", {
        errors: [
          {
            field: "status",
            code: ErrorCodes.REQUIRED,
            message: "Status must be active or disabled",
          },
        ],
      }),
    };
  }

  if (actorUserId === targetUserId && status === "disabled") {
    return {
      ok: false,
      response: problem(403, "Forbidden", "You cannot disable your own account", {
        errors: [
          {
            field: "status",
            code: ErrorCodes.CANNOT_DISABLE_SELF,
            message: "You cannot disable your own account",
          },
        ],
      }),
    };
  }

  const existing = await getPlatformUser(targetUserId);
  if (!existing) {
    return {
      ok: false,
      response: problem(404, "Not Found", "User not found", {
        errors: [
          {
            field: "userId",
            code: ErrorCodes.USER_NOT_FOUND,
            message: "User not found",
          },
        ],
      }),
    };
  }

  if (status === "disabled" && existing.isInstanceMember) {
    const memberCount = await countActiveInstanceMembers();
    if (memberCount <= 1) {
      return {
        ok: false,
        response: problem(403, "Forbidden", "Cannot disable the last active instance member", {
          errors: [
            {
              field: "status",
              code: ErrorCodes.LAST_PLATFORM_ADMIN,
              message: "Cannot disable the last instance member",
            },
          ],
        }),
      };
    }
  }

  if (existing.status === status) {
    return { ok: true, user: existing };
  }

  await getDb()`
    UPDATE users SET status = ${status}, updated_at = NOW()
    WHERE id = ${targetUserId}
  `;

  if (status === "disabled") {
    await revokeAllUserSessions(targetUserId);
  }

  await writeAuditEvent({
    actorUserId,
    action: status === "disabled" ? "user.disabled" : "user.enabled",
    resourceType: "user",
    resourceId: targetUserId,
    payload: { email: existing.email, previousStatus: existing.status, status },
  });

  const user = await getPlatformUser(targetUserId);
  return { ok: true, user: user! };
}

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
