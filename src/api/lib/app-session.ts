import type { SQL } from "bun";

import { sha256Hex, randomToken } from "./crypto";
import { maskIpForDisplay, parseClientLabel } from "./client-hint";
import { getDb } from "./db";
import { loadConfig } from "./config";
import { clientIp } from "./rate-limit";
import { safeDecodeURIComponent } from "@z0/contracts/validation";

export const APP_SESSION_COOKIE = "z0_app_session";
const SESSION_DAYS = 14;

export type ActiveAppSession = {
  appUserId: string;
  appId: string;
  sessionId: string;
};

export type PreparedAppSession = {
  existingToken: string | null;
  existingHash: string | null;
  generatedToken: string;
  generatedHash: string;
  generatedExpiresAt: Date;
  ipHash: string;
  userAgentHash: string;
  clientLabel: string;
  ipDisplay: string;
};

export async function prepareAppSession(req: Request): Promise<PreparedAppSession> {
  const existingToken = parseCookies(req).get(APP_SESSION_COOKIE) ?? null;
  const generatedToken = randomToken(32);
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  return {
    existingToken,
    existingHash: existingToken ? await sha256Hex(existingToken) : null,
    generatedToken,
    generatedHash: await sha256Hex(generatedToken),
    generatedExpiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    ipHash: await sha256Hex(ip),
    userAgentHash: await sha256Hex(ua),
    clientLabel: parseClientLabel(ua),
    ipDisplay: maskIpForDisplay(ip),
  };
}

export async function insertAppSession(
  tx: SQL,
  appUserId: string,
  appId: string,
  prepared: PreparedAppSession,
): Promise<{ token: string; expiresAt: Date }> {
  const [existingBrowser] = prepared.existingHash
    ? await tx`
        SELECT id, expires_at
        FROM app_browser_sessions
        WHERE token_hash = ${prepared.existingHash}
          AND revoked_at IS NULL
          AND expires_at > NOW()
        FOR UPDATE
      `
    : [];
  let browserSessionId: string;
  let token: string;
  let expiresAt: Date;
  if (existingBrowser && prepared.existingToken) {
    browserSessionId = String((existingBrowser as { id: string }).id);
    token = prepared.existingToken;
    expiresAt = new Date((existingBrowser as { expires_at: Date }).expires_at);
  } else {
    const [createdBrowser] = await tx`
      INSERT INTO app_browser_sessions (
        token_hash, expires_at, ip_hash, user_agent_hash, client_label, ip_display
      ) VALUES (
        ${prepared.generatedHash}, ${prepared.generatedExpiresAt}, ${prepared.ipHash},
        ${prepared.userAgentHash}, ${prepared.clientLabel}, ${prepared.ipDisplay}
      ) RETURNING id
    `;
    browserSessionId = String((createdBrowser as { id: string }).id);
    token = prepared.generatedToken;
    expiresAt = prepared.generatedExpiresAt;
  }

  await tx`
    UPDATE app_user_sessions
    SET revoked_at = NOW()
    WHERE browser_session_id = ${browserSessionId}
      AND app_id = ${appId}
      AND revoked_at IS NULL
  `;
  await tx`
    INSERT INTO app_user_sessions (
      app_user_id, app_id, browser_session_id, token_hash, expires_at,
      ip_hash, user_agent_hash, client_label, ip_display
    ) VALUES (
      ${appUserId}, ${appId}, ${browserSessionId}, NULL, ${expiresAt},
      ${prepared.ipHash}, ${prepared.userAgentHash}, ${prepared.clientLabel}, ${prepared.ipDisplay}
    )
  `;
  return { token, expiresAt };
}

export async function createAppSession(
  appUserId: string,
  appId: string,
  req: Request,
): Promise<{ token: string; expiresAt: Date }> {
  const prepared = await prepareAppSession(req);
  return getDb().begin((tx) => insertAppSession(tx, appUserId, appId, prepared));
}

export async function revokeAppSessionByToken(token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await getDb().begin(async (tx) => {
    const [browser] = await tx`
      UPDATE app_browser_sessions SET revoked_at = NOW()
      WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
      RETURNING id
    `;
    if (browser) {
      await tx`
        UPDATE app_user_sessions SET revoked_at = NOW()
        WHERE browser_session_id = ${(browser as { id: string }).id} AND revoked_at IS NULL
      `;
    }
  });
}

export async function revokeAllAppUserSessions(appUserId: string): Promise<void> {
  await getDb()`
    UPDATE app_user_sessions SET revoked_at = NOW()
    WHERE app_user_id = ${appUserId} AND revoked_at IS NULL
  `;
}

export async function resolveAppSession(req: Request): Promise<ActiveAppSession | null> {
  return resolveAppSessionForApp(req, null);
}

export async function resolveAppSessionForApp(
  req: Request,
  appId: string | null,
): Promise<ActiveAppSession | null> {
  const token = parseCookies(req).get(APP_SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const [row] = await getDb()`
    SELECT s.id AS session_id, s.app_user_id, s.app_id, b.id AS browser_session_id
    FROM app_browser_sessions b
    JOIN app_user_sessions s ON s.browser_session_id = b.id
    JOIN app_users u ON u.id = s.app_user_id AND u.app_id = s.app_id
    WHERE b.token_hash = ${tokenHash}
      AND b.revoked_at IS NULL
      AND b.expires_at > NOW()
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
      AND u.status = 'active'
      AND u.disabled_at IS NULL
      AND u.deleted_at IS NULL
      AND (u.locked_until IS NULL OR u.locked_until <= NOW())
      AND (${appId}::uuid IS NULL OR s.app_id = ${appId})
    ORDER BY s.last_seen_at DESC
    LIMIT 1
  `;

  if (!row) return null;

  await getDb()`
    UPDATE app_browser_sessions
    SET last_seen_at = NOW()
    WHERE id = ${(row as { browser_session_id: string }).browser_session_id}
      AND last_seen_at < NOW() - INTERVAL '5 minutes'
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
    const decoded = safeDecodeURIComponent(rest.join("="));
    if (decoded !== null) map.set(rawKey, decoded);
  }
  return map;
}


export function readAppSessionToken(req: BunRequest): string | undefined {
  return parseCookies(req).get(APP_SESSION_COOKIE);
}
