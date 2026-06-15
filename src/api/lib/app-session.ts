import type { BunRequest } from "bun";

import { sha256Hex, randomToken } from "./crypto";
import { maskIpForDisplay, parseClientLabel } from "./client-hint";
import { getDb } from "./db";
import { loadConfig } from "./config";

export const APP_SESSION_COOKIE = "z0_app_session";
const SESSION_DAYS = 14;

export type ActiveAppSession = {
  appUserId: string;
  appId: string;
  sessionId: string;
};

export async function createAppSession(
  appUserId: string,
  appId: string,
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
    INSERT INTO app_user_sessions (
      app_user_id,
      app_id,
      token_hash,
      expires_at,
      ip_hash,
      user_agent_hash,
      client_label,
      ip_display
    )
    VALUES (
      ${appUserId},
      ${appId},
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

export async function revokeAppSessionByToken(token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await getDb()`
    UPDATE app_user_sessions SET revoked_at = NOW()
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
  `;
}

export async function revokeAllAppUserSessions(appUserId: string): Promise<void> {
  await getDb()`
    UPDATE app_user_sessions SET revoked_at = NOW()
    WHERE app_user_id = ${appUserId} AND revoked_at IS NULL
  `;
}

export async function resolveAppSession(req: Request): Promise<ActiveAppSession | null> {
  const token = parseCookies(req).get(APP_SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const [row] = await getDb()`
    SELECT s.id AS session_id, s.app_user_id, s.app_id
    FROM app_user_sessions s
    JOIN app_users u ON u.id = s.app_user_id AND u.app_id = s.app_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
      AND u.status = 'active'
  `;

  if (!row) return null;

  await getDb()`
    UPDATE app_user_sessions
    SET last_seen_at = NOW()
    WHERE id = ${(row as { session_id: string }).session_id}
  `;

  return {
    appUserId: String((row as { app_user_id: string }).app_user_id),
    appId: String((row as { app_id: string }).app_id),
    sessionId: String((row as { session_id: string }).session_id),
  };
}

export async function countActiveAppUserSessions(appUserId: string): Promise<number> {
  const [row] = await getDb()`
    SELECT COUNT(*)::int AS count
    FROM app_user_sessions
    WHERE app_user_id = ${appUserId}
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  return Number((row as { count: number }).count ?? 0);
}

export function appSessionCookieHeader(token: string, expiresAt: Date): string {
  const config = loadConfig();
  const secure = config.nodeEnv === "production";
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const parts = [
    `${APP_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearAppSessionCookieHeader(): string {
  const config = loadConfig();
  const secure = config.nodeEnv === "production";
  const parts = [`${APP_SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
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

export function readAppSessionToken(req: BunRequest): string | undefined {
  return parseCookies(req).get(APP_SESSION_COOKIE);
}
