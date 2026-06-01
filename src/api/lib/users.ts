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
  UserTenantMembership,
} from "@z0/contracts/users";

import { getDb } from "./db";
import { problem } from "./http";
import { hashPassword, verifyPassword } from "./password";
import { getPlatformRoleKeys } from "./roles";
import { revokeAllUserSessions, revokeOtherUserSessions } from "./session";
import { writeAuditEvent } from "./audit";

type UserRow = {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  created_at: Date | string;
};

function mapUserSummary(row: UserRow, platformRoles: string[]): PlatformUserSummary {
  return {
    id: String(row.id),
    email: row.email,
    name: row.name,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    platformRoles,
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
    const platformRoles = await getPlatformRoleKeys(String(userRow.id));
    users.push(mapUserSummary(userRow, platformRoles));
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
  const platformRoles = await getPlatformRoleKeys(userId);
  return mapUserSummary(userRow, platformRoles);
}

async function listUserTenantMemberships(userId: string): Promise<UserTenantMembership[]> {
  const rows = await getDb()`
    SELECT
      t.id,
      t.name,
      t.slug,
      tm.created_at,
      COALESCE(
        array_agg(DISTINCT r.key) FILTER (WHERE r.scope = 'tenant' AND ur.tenant_id = t.id),
        '{}'
      ) AS role_keys
    FROM tenant_memberships tm
    JOIN tenants t ON t.id = tm.tenant_id
    LEFT JOIN user_roles ur ON ur.user_id = tm.user_id AND ur.tenant_id = t.id
    LEFT JOIN roles r ON r.id = ur.role_id AND r.scope = 'tenant'
    WHERE tm.user_id = ${userId}
    GROUP BY t.id, t.name, t.slug, tm.created_at
    ORDER BY t.name ASC
  `;

  return rows.map((row) => {
    const r = row as {
      id: string;
      name: string;
      slug: string;
      created_at: Date;
      role_keys: string[];
    };
    const keys = Array.isArray(r.role_keys) ? r.role_keys.filter(Boolean) : [];
    return {
      tenantId: String(r.id),
      tenantName: r.name,
      tenantSlug: r.slug,
      roleKeys: keys.length ? keys : ["tenant_member"],
      joinedAt: new Date(r.created_at).toISOString(),
    };
  });
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
  const [tenantMemberships, activeSessionCount] = await Promise.all([
    listUserTenantMemberships(userId),
    countUserActiveSessions(userId),
  ]);
  return { ...summary, tenantMemberships, activeSessionCount };
}

async function countActivePlatformAdmins(): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(DISTINCT ur.user_id)::int AS count
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN users u ON u.id = ur.user_id
    WHERE r.key = 'platform_admin'
      AND r.scope = 'platform'
      AND ur.tenant_id IS NULL
      AND u.status = 'active'
  `;
  return Number((row as { count: number }).count ?? 0);
}

async function userIsActivePlatformAdmin(userId: string): Promise<boolean> {
  const roles = await getPlatformRoleKeys(userId);
  if (!roles.includes("platform_admin")) return false;
  const [row] = await getDb()`
    SELECT status FROM users WHERE id = ${userId}
  `;
  return (row as { status: UserStatus } | undefined)?.status === "active";
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

  if (status === "disabled" && (await userIsActivePlatformAdmin(targetUserId))) {
    const adminCount = await countActivePlatformAdmins();
    if (adminCount <= 1) {
      return {
        ok: false,
        response: problem(403, "Forbidden", "Cannot disable the last platform administrator", {
          errors: [
            {
              field: "status",
              code: ErrorCodes.LAST_PLATFORM_ADMIN,
              message: "Cannot disable the last platform administrator",
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
