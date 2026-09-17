import type { SQL } from "bun";
import type { OperatorAssuranceLevel } from "../../capabilities/operator-access";

import { sha256Hex, randomToken } from "./crypto";
import { maskIpForDisplay, parseClientLabel } from "./client-hint";
import { getDb } from "./db";
import { loadConfig } from "./config";
import { writeAuditEvent } from "./audit";
import { clientIp } from "./rate-limit";
import { safeDecodeURIComponent } from "@z0/contracts/validation";

export const SESSION_COOKIE = "z0_session";

export type PreparedSession = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
  idleExpiresAt: Date;
  idleTimeoutMinutes: number;
  ipHash: string;
  userAgentHash: string;
  clientLabel: string;
  ipDisplay: string | null;
};

export type SessionAssurance = {
  primaryAuthenticatedAt?: Date;
  mfaAuthenticatedAt?: Date | null;
  authenticationMethod?: string;
  assuranceLevel?: OperatorAssuranceLevel;
};

export async function prepareSession(req: Request): Promise<PreparedSession> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const config = loadConfig();
  const now = Date.now();
  const expiresAt = new Date(now + config.operatorSessionAbsoluteHours * 60 * 60 * 1000);
  const idleExpiresAt = new Date(Math.min(
    expiresAt.getTime(),
    now + config.operatorSessionIdleMinutes * 60 * 1000,
  ));
  const ip = clientIp(req);
  const ipHash = await sha256Hex(ip);
  const ua = req.headers.get("user-agent") ?? "";
  return {
    token,
    tokenHash,
    expiresAt,
    idleExpiresAt,
    idleTimeoutMinutes: config.operatorSessionIdleMinutes,
    ipHash,
    userAgentHash: await sha256Hex(ua),
    clientLabel: parseClientLabel(ua),
    ipDisplay: maskIpForDisplay(ip),
  };
}

export async function insertSession(
  tx: SQL,
  userId: string,
  prepared: PreparedSession,
  assurance: SessionAssurance = {},
): Promise<{ token: string; expiresAt: Date }> {
  const authenticationMethod = assurance.authenticationMethod ?? "password";
  const assuranceLevel = assurance.assuranceLevel ?? (
    authenticationMethod === "passkey"
      ? "phishing_resistant"
      : assurance.mfaAuthenticatedAt
        ? "multi_factor"
        : "primary"
  );
  await tx`
    INSERT INTO sessions (
      user_id,
      token_hash,
      expires_at,
      ip_hash,
      user_agent_hash,
      client_label,
      ip_display,
      primary_authenticated_at,
      mfa_authenticated_at,
      authentication_method,
      idle_timeout_minutes,
      idle_expires_at,
      assurance_level
    )
    VALUES (
      ${userId},
      ${prepared.tokenHash},
      ${prepared.expiresAt},
      ${prepared.ipHash},
      ${prepared.userAgentHash},
      ${prepared.clientLabel},
      ${prepared.ipDisplay},
      ${assurance.primaryAuthenticatedAt ?? new Date()},
      ${assurance.mfaAuthenticatedAt ?? null},
      ${authenticationMethod},
      ${prepared.idleTimeoutMinutes},
      ${prepared.idleExpiresAt},
      ${assuranceLevel}
    )
  `;

  return { token: prepared.token, expiresAt: prepared.expiresAt };
}

export async function createSession(
  userId: string,
  req: Request,
  assurance: SessionAssurance = {},
): Promise<{ token: string; expiresAt: Date }> {
  const prepared = await prepareSession(req);
  return insertSession(getDb(), userId, prepared, assurance);
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await getDb()`
    UPDATE sessions SET revoked_at = NOW()
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
  `;
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await getDb()`
    UPDATE sessions SET revoked_at = NOW()
    WHERE user_id = ${userId} AND revoked_at IS NULL
  `;
}

export async function revokeOtherUserSessions(userId: string, exceptSessionId: string): Promise<void> {
  await getDb()`
    UPDATE sessions SET revoked_at = NOW()
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
      AND id != ${exceptSessionId}
  `;
}

export type ActiveSession = {
  userId: string;
  sessionId: string;
  assuranceLevel: OperatorAssuranceLevel;
  primaryAuthenticatedAt: Date;
  mfaAuthenticatedAt: Date | null;
  resolvedAt: Date;
};

export async function resolveSession(req: Request): Promise<ActiveSession | null> {
  const token = parseCookies(req).get(SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  return getDb().begin(async (tx) => {
    const [row] = await tx`
      SELECT s.id AS session_id, s.user_id, s.expires_at, s.idle_expires_at,
             s.idle_timeout_minutes, s.assurance_level,
             s.primary_authenticated_at, s.mfa_authenticated_at,
             NOW() AS authoritative_now,
             s.expires_at <= NOW() AS absolute_expired,
             s.idle_expires_at <= NOW() AS idle_expired,
             (
               u.status = 'active'
               AND u.disabled_at IS NULL
               AND u.deleted_at IS NULL
               AND (u.locked_until IS NULL OR u.locked_until <= NOW())
             ) AS account_available,
             CASE
               WHEN u.deleted_at IS NOT NULL THEN 'deleted'
               WHEN u.disabled_at IS NOT NULL OR u.status != 'active' THEN 'disabled'
               WHEN u.locked_until > NOW() THEN 'locked'
               ELSE NULL
             END AS account_unavailable_reason
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash} AND s.revoked_at IS NULL
      FOR UPDATE OF s
    `;
    if (!row) return null;

    const session = row as {
      session_id: string;
      user_id: string;
      expires_at: Date;
      idle_expires_at: Date;
      idle_timeout_minutes: number;
      assurance_level: OperatorAssuranceLevel;
      primary_authenticated_at: Date;
      mfa_authenticated_at: Date | null;
      authoritative_now: Date;
      absolute_expired: boolean;
      idle_expired: boolean;
      account_available: boolean;
      account_unavailable_reason: "deleted" | "disabled" | "locked" | null;
    };
    const expiryReason = session.absolute_expired
      ? "absolute_timeout"
      : session.idle_expired
        ? "idle_timeout"
        : null;
    if (expiryReason) {
      await tx`UPDATE sessions SET revoked_at = NOW() WHERE id = ${session.session_id}`;
      await writeAuditEvent({
        actorUserId: session.user_id,
        action: "session.expired",
        resourceType: "session",
        resourceId: session.session_id,
        payload: { reason: expiryReason },
      }, tx);
      return null;
    }

    if (!session.account_available) {
      await tx`UPDATE sessions SET revoked_at = NOW() WHERE id = ${session.session_id}`;
      await writeAuditEvent({
        actorUserId: session.user_id,
        action: "session.revoked_account_state",
        resourceType: "session",
        resourceId: session.session_id,
        payload: { reason: session.account_unavailable_reason ?? "unavailable" },
      }, tx);
      return null;
    }

    await tx`
      UPDATE sessions
      SET last_seen_at = NOW(),
          idle_expires_at = LEAST(
            expires_at,
            NOW() + make_interval(mins => idle_timeout_minutes)
          )
      WHERE id = ${session.session_id}
        AND last_seen_at < NOW() - INTERVAL '1 minute'
    `;

    return {
      userId: String(session.user_id),
      sessionId: String(session.session_id),
      assuranceLevel: session.assurance_level,
      primaryAuthenticatedAt: session.primary_authenticated_at,
      mfaAuthenticatedAt: session.mfa_authenticated_at,
      resolvedAt: session.authoritative_now,
    };
  });
}

export function sessionCookieHeader(token: string, expiresAt: Date): string {
  const config = loadConfig();
  const secure = config.nodeEnv === "production";
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(): string {
  const config = loadConfig();
  const secure = config.nodeEnv === "production";
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function parseCookies(req: Request): Map<string, string> {
  const header = req.headers.get("cookie") ?? "";
  const map = new Map<string, string>();
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) continue;
    const decoded = safeDecodeURIComponent(rest.join("="));
    if (decoded !== null) map.set(rawKey, decoded);
  }
  return map;
}
