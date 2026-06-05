import type { BunRequest } from "bun";

import { clientIdFromAuthorizePath, resolveAuthRealm } from "../../api/lib/auth-realm";
import { withDatabaseErrorHandling } from "../../api/lib/database-errors";
import { resolveAppSession } from "../../api/lib/app-session";
import { getDb } from "../../api/lib/db";
import { problem } from "../../api/lib/http";

const OAUTH_RETURN_COOKIE = "z0_oauth_return";

function setReturnCookie(value: string): string {
  return `${OAUTH_RETURN_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;
}

function clearReturnCookie(): string {
  return `${OAUTH_RETURN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function getCookie(req: Request, key: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === key) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function validateAuthorizeRequest(url: URL): Response | null {
  if (url.searchParams.get("response_type") !== "code") {
    return problem(400, "Bad Request", "response_type=code is required");
  }
  if (!url.searchParams.get("client_id")) {
    return problem(400, "Bad Request", "client_id is required");
  }
  if (!url.searchParams.get("redirect_uri")) {
    return problem(400, "Bad Request", "redirect_uri is required");
  }
  return null;
}

async function findAppIdForClient(clientId: string): Promise<string | null> {
  const [row] = await getDb()`
    SELECT app_id
    FROM app_credentials
    WHERE client_id = ${clientId}
      AND status = 'active'
    LIMIT 1
  `;
  return row ? String((row as { app_id: string }).app_id) : null;
}

function redirectWithCode(url: URL): Response {
  const redirectUri = url.searchParams.get("redirect_uri")!;
  const state = url.searchParams.get("state");
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", "dev-auth-code");
  if (state) redirect.searchParams.set("state", state);

  const headers = new Headers({ Location: redirect.toString() });
  headers.append("Set-Cookie", clearReturnCookie());
  return new Response(null, { status: 302, headers });
}

function loginRedirectForAuthorize(req: BunRequest, authorizePath: string): Response {
  const clientId = clientIdFromAuthorizePath(authorizePath);
  const params = new URLSearchParams({
    return_to: authorizePath,
  });
  if (clientId) params.set("client_id", clientId);

  const headers = new Headers({
    Location: `/auth/login?${params.toString()}`,
  });
  headers.append("Set-Cookie", setReturnCookie(authorizePath));
  return new Response(null, { status: 302, headers });
}

async function getAuthorize(req: BunRequest): Promise<Response> {
  const url = new URL(req.url);
  const invalid = validateAuthorizeRequest(url);
  if (invalid) return invalid;

  const clientId = url.searchParams.get("client_id")!;
  const appId = await findAppIdForClient(clientId);
  if (!appId) {
    return problem(400, "Bad Request", "Unknown client_id");
  }

  const appSession = await resolveAppSession(req);
  if (!appSession || appSession.appId !== appId) {
    return loginRedirectForAuthorize(req, `${url.pathname}${url.search}`);
  }

  return redirectWithCode(url);
}

async function getResume(req: BunRequest): Promise<Response> {
  const pending = getCookie(req, OAUTH_RETURN_COOKIE);
  if (!pending) {
    return Response.redirect(new URL("/", req.url), 302);
  }

  const realm = await resolveAuthRealm(req, { returnTo: pending });
  if (realm.mode === "app") {
    const appSession = await resolveAppSession(req);
    if (!appSession || appSession.appId !== realm.appId) {
      return loginRedirectForAuthorize(req, pending);
    }
  }

  return Response.redirect(new URL(pending, req.url), 302);
}

export const oauthWebRoutes = {
  "/oauth/authorize": {
    GET: withDatabaseErrorHandling(getAuthorize),
  },
  "/oauth/resume": {
    GET: getResume,
  },
} as const;
