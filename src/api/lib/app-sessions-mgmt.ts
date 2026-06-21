import type { SessionSummary } from "@z0/contracts/sessions";

import { writeAuditEvent } from "./audit";
import { getDb } from "./db";
import { problem } from "./http";
import { ErrorCodes } from "@z0/contracts/errors";

type AppSessionRow = {
  id: string;
  client_label: string;
  ip_display: string | null;
  last_seen_at: Date;
  created_at: Date;
};

function toSummary(row: AppSessionRow): SessionSummary {
  return {
    id: String(row.id),
    clientLabel: row.client_label,
    ipDisplay: row.ip_display,
    lastSeenAt: row.last_seen_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    isCurrent: false,
  };
}

export async function listActiveAppUserSessionsForAdmin(
  appId: string,
  appUserId: string,
): Promise<
  { ok: true; sessions: SessionSummary[] } | { ok: false; response: Response }
> {
  const [userRow] = await getDb()`
    SELECT id FROM app_users WHERE id = ${appUserId} AND app_id = ${appId}
  `;
  if (!userRow) {
    return {
      ok: false,
      response: problem(404, "Not Found", "App user not found", {
        errors: [{ field: "userId", code: ErrorCodes.APP_USER_NOT_FOUND, message: "App user not found" }],
      }),
    };
  }

  const rows = await getDb()`
    SELECT id, client_label, ip_display, last_seen_at, created_at
    FROM app_user_sessions
    WHERE app_user_id = ${appUserId}
      AND app_id = ${appId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    ORDER BY last_seen_at DESC
  `;

  return { ok: true, sessions: (rows as AppSessionRow[]).map(toSummary) };
}

export async function listActiveAppUserSessionsForSelf(
  appUserId: string,
  appId: string,
  currentSessionId: string,
): Promise<SessionSummary[]> {
  const rows = await getDb()`
    SELECT id, client_label, ip_display, last_seen_at, created_at
    FROM app_user_sessions
    WHERE app_user_id = ${appUserId}
      AND app_id = ${appId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    ORDER BY last_seen_at DESC
  `;

  return (rows as AppSessionRow[]).map((row) => ({
    ...toSummary(row),
    isCurrent: String(row.id) === currentSessionId,
  }));
}

export async function revokeAppUserSessionForAdmin(
  actorUserId: string,
  appId: string,
  appUserId: string,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const [row] = await getDb()`
    SELECT s.id
    FROM app_user_sessions s
    JOIN app_users u ON u.id = s.app_user_id AND u.app_id = s.app_id
    WHERE s.id = ${sessionId}
      AND s.app_user_id = ${appUserId}
      AND s.app_id = ${appId}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
  `;

  if (!row) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Session not found", {
        errors: [{ field: "sessionId", code: ErrorCodes.SESSION_NOT_FOUND, message: "Session not found" }],
      }),
    };
  }

  await getDb()`
    UPDATE app_user_sessions SET revoked_at = NOW()
    WHERE id = ${sessionId} AND revoked_at IS NULL
  `;

  await writeAuditEvent({
    actorUserId,
    action: "app_user_session.revoked",
    resourceType: "app_user_session",
    resourceId: sessionId,
    payload: { appId, appUserId },
  });

  return { ok: true };
}

export async function revokeAppUserSessionForSelf(
  appUserId: string,
  appId: string,
  currentSessionId: string,
  sessionId: string,
): Promise<
  | { ok: true; revokedCurrent: boolean; clearCookie: boolean }
  | { ok: false; response: Response }
> {
  const [row] = await getDb()`
    SELECT id
    FROM app_user_sessions
    WHERE id = ${sessionId}
      AND app_user_id = ${appUserId}
      AND app_id = ${appId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;

  if (!row) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Session not found", {
        errors: [{ field: "sessionId", code: ErrorCodes.SESSION_NOT_FOUND, message: "Session not found" }],
      }),
    };
  }

  const revokedCurrent = String((row as { id: string }).id) === currentSessionId;

  await getDb()`
    UPDATE app_user_sessions SET revoked_at = NOW()
    WHERE id = ${sessionId} AND revoked_at IS NULL
  `;

  return { ok: true, revokedCurrent, clearCookie: revokedCurrent };
}

export async function revokeAllOtherAppUserSessionsForSelf(
  appUserId: string,
  appId: string,
  currentSessionId: string,
): Promise<number> {
  const before = await getDb()`
    SELECT COUNT(*)::int AS count
    FROM app_user_sessions
    WHERE app_user_id = ${appUserId}
      AND app_id = ${appId}
      AND id != ${currentSessionId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  const countBefore = Number((before[0] as { count: number }).count);

  if (countBefore > 0) {
    await getDb()`
      UPDATE app_user_sessions SET revoked_at = NOW()
      WHERE app_user_id = ${appUserId}
        AND app_id = ${appId}
        AND id != ${currentSessionId}
        AND revoked_at IS NULL
    `;
  }

  return countBefore;
}
