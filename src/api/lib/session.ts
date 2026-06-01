import type { BunRequest } from "bun";

import { sha256Hex, randomToken } from "./crypto";
import { maskIpForDisplay, parseClientLabel } from "./client-hint";
import { getDb } from "./db";
import { loadConfig } from "./config";

export const SESSION_COOKIE = "z0_session";
const SESSION_DAYS = 14;

export async function createSession(
  userId: string,
  req: Request,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const ip = clientIp(req);
  const ipHash = await sha256Hex(ip);
  const ua = req.headers.get("user-agent") ?? "";
  const userAgentHash = await sha256Hex(ua);
  const clientLabel = parseClientLabel(ua);
  const ipDisplay = maskIpForDisplay(ip);

  await getDb()`
    INSERT INTO sessions (
      user_id,
      token_hash,
      expires_at,
      ip_hash,
      user_agent_hash,
      client_label,
      ip_display
    )
    VALUES (
      ${userId},
      ${tokenHash},
      ${expiresAt},
      ${ipHash},
      ${userAgentHash},
      ${clientLabel},
      ${ipDisplay}
    )
  `;

  return { token, expiresAt };
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
  `;

  if (!row) return null;

  await getDb()`
    UPDATE sessions SET last_seen_at = NOW() WHERE id = ${(row as { session_id: string }).session_id}
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
    map.set(rawKey, decodeURIComponent(rest.join("=")));
  }
  return map;
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return "local";
}
