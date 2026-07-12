import { findAppRow } from "./apps";
import { getDb } from "./db";
import { safeDecodeURIComponent } from "@z0/contracts/validation";

const OAUTH_RETURN_COOKIE = "z0_oauth_return";

export type ConsoleAuthRealm = { mode: "console" };

export type AppAuthRealm = {
  mode: "app";
  appId: string;
  appName: string;
  clientId: string;
};

export type InvalidAuthRealm = {
  mode: "invalid";
  message: string;
};

export type AuthRealm = ConsoleAuthRealm | AppAuthRealm | InvalidAuthRealm;

type AppClientRow = {
  app_id: string;
  app_name: string;
  app_status: string;
  client_id: string;
};

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

export function clientIdFromAuthorizePath(path: string): string | null {
  try {
    const url = new URL(path, "http://localhost");
    if (!url.pathname.startsWith("/oauth/authorize")) return null;
    return url.searchParams.get("client_id");
  } catch {
    return null;
  }
}

function clientIdHintsFromRequest(req: Request, extra?: { clientId?: string; returnTo?: string }): string[] {
  const hints: string[] = [];
  const url = new URL(req.url);

  if (extra?.clientId?.trim()) hints.push(extra.clientId.trim());
  if (url.searchParams.get("client_id")?.trim()) hints.push(url.searchParams.get("client_id")!.trim());

  const returnTo = extra?.returnTo?.trim() || url.searchParams.get("return_to")?.trim();
  if (returnTo) {
    const fromReturn = clientIdFromAuthorizePath(returnTo);
    if (fromReturn) hints.push(fromReturn);
  }

  const oauthReturn = parseCookies(req).get(OAUTH_RETURN_COOKIE);
  if (oauthReturn) {
    const fromCookie = clientIdFromAuthorizePath(oauthReturn);
    if (fromCookie) hints.push(fromCookie);
  }

  return [...new Set(hints)];
}

export async function findAppByClientId(clientId: string): Promise<AppClientRow | null> {
  const [row] = await getDb()`
    SELECT
      a.id AS app_id,
      a.name AS app_name,
      a.status AS app_status,
      c.client_id
    FROM app_credentials c
    JOIN apps a ON a.id = c.app_id
    WHERE c.client_id = ${clientId}
      AND c.status = 'active'
    LIMIT 1
  `;
  if (!row) return null;
  const r = row as AppClientRow;
  return {
    app_id: String(r.app_id),
    app_name: r.app_name,
    app_status: r.app_status,
    client_id: r.client_id,
  };
}

/** Resolve app id from any credential row (including revoked). */
export async function findAppIdByClientId(clientId: string): Promise<string | null> {
  const [row] = await getDb()`
    SELECT app_id
    FROM app_credentials
    WHERE client_id = ${clientId}
    LIMIT 1
  `;
  return row ? String((row as { app_id: string }).app_id) : null;
}

export async function resolveAuthRealm(
  req: Request,
  extra?: { clientId?: string; returnTo?: string },
): Promise<AuthRealm> {
  const hints = clientIdHintsFromRequest(req, extra);
  if (hints.length === 0) return { mode: "console" };

  const clientId = hints[0]!;
  const match = await findAppByClientId(clientId);
  if (!match) {
    return { mode: "invalid", message: "This application could not be found." };
  }

  const app = await findAppRow(match.app_id);
  if (!app || app.status !== "active") {
    return { mode: "invalid", message: "This application is not available for sign-in." };
  }

  return {
    mode: "app",
    appId: match.app_id,
    appName: match.app_name,
    clientId: match.client_id,
  };
}

export async function findActiveClientIdForApp(appId: string): Promise<string | null> {
  const [row] = await getDb()`
    SELECT client_id
    FROM app_credentials
    WHERE app_id = ${appId}
      AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return row ? String((row as { client_id: string }).client_id) : null;
}
