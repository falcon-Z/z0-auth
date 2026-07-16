import type { SQL } from "bun";

import { writeAuditEvent } from "./audit";
import { getDb } from "./db";

export type AccountStatus = "active" | "disabled" | "locked" | "deleted";

export type AccountLifecycleRow = {
  disabled_at: Date | null;
  locked_until: Date | null;
  deleted_at: Date | null;
};

export const FAILED_SIGN_IN_LIMIT = 10;
export const FAILED_SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
export const ACCOUNT_LOCK_MS = 15 * 60 * 1000;

export function accountStatus(row: AccountLifecycleRow, now = Date.now()): AccountStatus {
  if (row.deleted_at) return "deleted";
  if (row.disabled_at) return "disabled";
  if (row.locked_until && new Date(row.locked_until).getTime() > now) return "locked";
  return "active";
}

export function accountCanAuthenticate(row: AccountLifecycleRow, now = Date.now()): boolean {
  return accountStatus(row, now) === "active";
}

export async function revokeConsoleAccountAccess(
  tx: SQL,
  userId: string,
  email: string,
): Promise<void> {
  await tx`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
  await tx`UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ${userId} AND used_at IS NULL`;
  await tx`
    UPDATE magic_link_tokens SET used_at = NOW()
    WHERE realm = 'console' AND lower(email) = ${email.toLowerCase()} AND used_at IS NULL
  `;
}

export async function revokeAppAccountAccess(
  tx: SQL,
  appUserId: string,
  appId: string,
  email: string,
): Promise<void> {
  await tx`UPDATE app_user_sessions SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND revoked_at IS NULL`;
  await tx`UPDATE oauth_authorization_codes SET used_at = NOW() WHERE app_user_id = ${appUserId} AND used_at IS NULL`;
  await tx`UPDATE oauth_access_tokens SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND revoked_at IS NULL`;
  await tx`UPDATE oauth_refresh_tokens SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND revoked_at IS NULL`;
  await tx`UPDATE app_password_reset_tokens SET used_at = NOW() WHERE app_user_id = ${appUserId} AND used_at IS NULL`;
  await tx`UPDATE app_email_verification_tokens SET used_at = NOW() WHERE app_user_id = ${appUserId} AND used_at IS NULL`;
  await tx`
    UPDATE magic_link_tokens SET used_at = NOW()
    WHERE realm = 'app' AND app_id = ${appId} AND lower(email) = ${email.toLowerCase()} AND used_at IS NULL
  `;
  await tx`
    UPDATE app_user_provider_tokens t SET revoked_at = NOW(), updated_at = NOW()
    FROM app_user_identities i
    WHERE t.app_user_identity_id = i.id
      AND i.app_user_id = ${appUserId}
      AND i.app_id = ${appId}
      AND t.revoked_at IS NULL
  `;
}

export async function clearConsoleSignInFailures(userId: string): Promise<void> {
  await getDb()`
    UPDATE users
    SET failed_sign_in_count = 0,
        failed_sign_in_window_started_at = NULL,
        locked_until = NULL,
        updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function clearAppSignInFailures(appUserId: string): Promise<void> {
  await getDb()`
    UPDATE app_users
    SET failed_sign_in_count = 0,
        failed_sign_in_window_started_at = NULL,
        locked_until = NULL,
        updated_at = NOW()
    WHERE id = ${appUserId}
  `;
}

export async function finalizeConsolePasswordSignIn<T>(
  userId: string,
  createAuthority: (tx: SQL) => Promise<T>,
): Promise<T | null> {
  return getDb().begin(async (tx) => {
    const [row] = await tx`
      SELECT status, disabled_at, locked_until, deleted_at
      FROM users
      WHERE id = ${userId}
      FOR UPDATE
    `;
    if (!row) return null;
    const current = row as AccountLifecycleRow & { status: string };
    if (current.status !== "active" || !accountCanAuthenticate(current)) return null;

    await tx`
      UPDATE users
      SET failed_sign_in_count = 0,
          failed_sign_in_window_started_at = NULL,
          locked_until = NULL,
          updated_at = NOW()
      WHERE id = ${userId}
    `;
    return createAuthority(tx);
  });
}

export async function finalizeAppPasswordSignIn<T>(
  appUserId: string,
  appId: string,
  createAuthority: (tx: SQL) => Promise<T>,
): Promise<T | null> {
  return getDb().begin(async (tx) => {
    const [row] = await tx`
      SELECT status, disabled_at, locked_until, deleted_at
      FROM app_users
      WHERE id = ${appUserId}
        AND app_id = ${appId}
      FOR UPDATE
    `;
    if (!row) return null;
    const current = row as AccountLifecycleRow & { status: string };
    if (current.status !== "active" || !accountCanAuthenticate(current)) return null;

    await tx`
      UPDATE app_users
      SET failed_sign_in_count = 0,
          failed_sign_in_window_started_at = NULL,
          locked_until = NULL,
          updated_at = NOW()
      WHERE id = ${appUserId}
        AND app_id = ${appId}
    `;
    return createAuthority(tx);
  });
}

export async function recordConsolePasswordFailure(userId: string): Promise<boolean> {
  return getDb().begin(async (tx) => {
    const [row] = await tx`
      SELECT email, disabled_at, deleted_at, locked_until,
             failed_sign_in_count, failed_sign_in_window_started_at
      FROM users WHERE id = ${userId} FOR UPDATE
    `;
    if (!row) return false;
    const value = row as AccountLifecycleRow & {
      email: string;
      failed_sign_in_count: number;
      failed_sign_in_window_started_at: Date | null;
    };
    if (value.disabled_at || value.deleted_at) return false;

    const now = Date.now();
    if (value.locked_until && new Date(value.locked_until).getTime() > now) return false;
    const windowStart = value.failed_sign_in_window_started_at
      ? new Date(value.failed_sign_in_window_started_at).getTime()
      : 0;
    const withinWindow = now - windowStart < FAILED_SIGN_IN_WINDOW_MS;
    const nextCount = withinWindow ? Number(value.failed_sign_in_count) + 1 : 1;
    const nextWindow = withinWindow ? value.failed_sign_in_window_started_at : new Date(now);
    const shouldLock = nextCount >= FAILED_SIGN_IN_LIMIT;
    const wasLocked = Boolean(value.locked_until && new Date(value.locked_until).getTime() > now);

    await tx`
      UPDATE users
      SET failed_sign_in_count = ${shouldLock ? 0 : nextCount},
          failed_sign_in_window_started_at = ${shouldLock ? null : nextWindow},
          locked_until = ${shouldLock ? new Date(now + ACCOUNT_LOCK_MS) : value.locked_until},
          updated_at = NOW()
      WHERE id = ${userId}
    `;
    if (shouldLock && !wasLocked) {
      await revokeConsoleAccountAccess(tx, userId, value.email);
      await writeAuditEvent({
        action: "console_member.locked",
        resourceType: "console_member",
        resourceId: userId,
        payload: { reason: "failed_password", durationMinutes: ACCOUNT_LOCK_MS / 60000 },
      }, tx);
    }
    return shouldLock;
  });
}

export async function recordAppPasswordFailure(appUserId: string): Promise<boolean> {
  return getDb().begin(async (tx) => {
    const [row] = await tx`
      SELECT app_id, email, disabled_at, deleted_at, locked_until,
             failed_sign_in_count, failed_sign_in_window_started_at
      FROM app_users WHERE id = ${appUserId} FOR UPDATE
    `;
    if (!row) return false;
    const value = row as AccountLifecycleRow & {
      app_id: string;
      email: string;
      failed_sign_in_count: number;
      failed_sign_in_window_started_at: Date | null;
    };
    if (value.disabled_at || value.deleted_at) return false;

    const now = Date.now();
    if (value.locked_until && new Date(value.locked_until).getTime() > now) return false;
    const windowStart = value.failed_sign_in_window_started_at
      ? new Date(value.failed_sign_in_window_started_at).getTime()
      : 0;
    const withinWindow = now - windowStart < FAILED_SIGN_IN_WINDOW_MS;
    const nextCount = withinWindow ? Number(value.failed_sign_in_count) + 1 : 1;
    const nextWindow = withinWindow ? value.failed_sign_in_window_started_at : new Date(now);
    const shouldLock = nextCount >= FAILED_SIGN_IN_LIMIT;
    const wasLocked = Boolean(value.locked_until && new Date(value.locked_until).getTime() > now);

    await tx`
      UPDATE app_users
      SET failed_sign_in_count = ${shouldLock ? 0 : nextCount},
          failed_sign_in_window_started_at = ${shouldLock ? null : nextWindow},
          locked_until = ${shouldLock ? new Date(now + ACCOUNT_LOCK_MS) : value.locked_until},
          updated_at = NOW()
      WHERE id = ${appUserId}
    `;
    if (shouldLock && !wasLocked) {
      await revokeAppAccountAccess(tx, appUserId, String(value.app_id), value.email);
      await writeAuditEvent({
        action: "app_user.locked",
        resourceType: "app_user",
        resourceId: appUserId,
        payload: { appId: String(value.app_id), reason: "failed_password", durationMinutes: ACCOUNT_LOCK_MS / 60000 },
      }, tx);
    }
    return shouldLock;
  });
}
