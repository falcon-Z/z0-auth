import type { SQL } from "bun";

import { sha256Hex, randomToken } from "./crypto";
import { maskIpForDisplay, parseClientLabel } from "./client-hint";
import { getDb } from "./db";
import { loadConfig } from "./config";
import { clientIp } from "./rate-limit";
import { safeDecodeURIComponent } from "@z0/contracts/validation";

export const SESSION_COOKIE = "z0_session";
const SESSION_DAYS = 14;

export type PreparedSession = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
  ipHash: string;
  userAgentHash: string;
  clientLabel: string;
  ipDisplay: string;
};

export type SessionAssurance = {
  primaryAuthenticatedAt?: Date;
  mfaAuthenticatedAt?: Date | null;
  authenticationMethod?: string;
};

export async function prepareSession(req: Request): Promise<PreparedSession> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const ip = clientIp(req);
  const ipHash = await sha256Hex(ip);
  const ua = req.headers.get("user-agent") ?? "";
  return {
    token,
    tokenHash,
    expiresAt,
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
      authentication_method
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
      ${assurance.authenticationMethod ?? "password"}
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
};

export async function resolveSession(req: Request): Promise<ActiveSession | null> {
  const token = parseCookies(req).get(SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const [row] = await getDb()`
    SELECT s.id AS session_id, s.user_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
      AND u.status = 'active'
      AND u.disabled_at IS NULL
      AND u.deleted_at IS NULL
      AND (u.locked_until IS NULL OR u.locked_until <= NOW())
  `;

  if (!row) return null;

  await getDb()`
    UPDATE sessions SET last_seen_at = NOW()
    WHERE id = ${(row as { session_id: string }).session_id}
      AND last_seen_at < NOW() - INTERVAL '5 minutes'
  `;

  return {
    userId: String((row as { user_id: string }).user_id),
    sessionId: String((row as { session_id: string }).session_id),
  };
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
