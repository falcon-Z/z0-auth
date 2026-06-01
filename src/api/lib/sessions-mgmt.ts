import type { SessionSummary } from "@z0/contracts/sessions";

import { writeAuditEvent } from "./audit";
import { getDb } from "./db";
import { problem } from "./http";
import { ErrorCodes } from "@z0/contracts/errors";
import {
  clearSessionCookieHeader,
  revokeOtherUserSessions,
  revokeSessionByToken,
  SESSION_COOKIE,
} from "./session";
import { parseCookies } from "./csrf";

type SessionRow = {
  id: string;
  client_label: string;
  ip_display: string | null;
  last_seen_at: Date;
  created_at: Date;
};

function toSummary(row: SessionRow, currentSessionId: string): SessionSummary {
  return {
    id: String(row.id),
    clientLabel: row.client_label,
    ipDisplay: row.ip_display,
    lastSeenAt: row.last_seen_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    isCurrent: String(row.id) === currentSessionId,
  };
}

export async function listActiveSessionsForUser(
  userId: string,
  currentSessionId: string,
): Promise<SessionSummary[]> {
  const rows = await getDb()`
    SELECT id, client_label, ip_display, last_seen_at, created_at
    FROM sessions
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    ORDER BY last_seen_at DESC
  `;

  return (rows as SessionRow[]).map((row) => toSummary(row, currentSessionId));
}

export async function revokeUserSession(
  actorUserId: string,
  currentSessionId: string,
  sessionId: string,
  req: Request,
): Promise<
  | { ok: true; revokedCurrent: boolean; clearCookie: boolean }
  | { ok: false; response: Response }
> {
  const [row] = await getDb()`
    SELECT id, token_hash
    FROM sessions
    WHERE id = ${sessionId}
      AND user_id = ${actorUserId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;

  if (!row) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Session not found", {
        errors: [
          {
            field: "sessionId",
            code: ErrorCodes.SESSION_NOT_FOUND,
            message: "Session not found",
          },
        ],
      }),
    };
  }

  const revokedCurrent = String((row as { id: string }).id) === currentSessionId;

  if (revokedCurrent) {
    const token = parseCookies(req).get(SESSION_COOKIE);
    if (token) await revokeSessionByToken(token);
  } else {
    await getDb()`
      UPDATE sessions SET revoked_at = NOW()
      WHERE id = ${sessionId} AND revoked_at IS NULL
    `;
  }

  await writeAuditEvent({
    actorUserId,
    action: revokedCurrent ? "session.revoked_current" : "session.revoked",
    resourceType: "session",
    resourceId: sessionId,
  });

  return { ok: true, revokedCurrent, clearCookie: revokedCurrent };
}

export async function revokeAllOtherSessionsForUser(
  actorUserId: string,
  currentSessionId: string,
): Promise<number> {
  const before = await getDb()`
    SELECT COUNT(*)::int AS count
    FROM sessions
    WHERE user_id = ${actorUserId}
      AND id != ${currentSessionId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  const countBefore = Number((before[0] as { count: number }).count);

  await revokeOtherUserSessions(actorUserId, currentSessionId);

  if (countBefore > 0) {
    await writeAuditEvent({
      actorUserId,
      action: "session.revoked_others",
      resourceType: "user",
      resourceId: actorUserId,
      payload: { revokedCount: countBefore },
    });
  }

  return countBefore;
}

export function revokeSessionClearCookieHeader(): string {
  return clearSessionCookieHeader();
}
