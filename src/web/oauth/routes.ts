import type { BunRequest } from "bun";

import { withDatabaseErrorHandling } from "../../api/lib/database-errors";
import { problem } from "../../api/lib/http";
import { resolveSession } from "../../api/lib/session";

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

async function getAuthorize(req: BunRequest): Promise<Response> {
  const url = new URL(req.url);
  const invalid = validateAuthorizeRequest(url);
  if (invalid) return invalid;

  const session = await resolveSession(req);
  if (!session) {
    const headers = new Headers({
      Location: `/auth/login?return_to=${encodeURIComponent(`${url.pathname}${url.search}`)}`,
    });
    headers.append("Set-Cookie", setReturnCookie(`${url.pathname}${url.search}`));
    return new Response(null, { status: 302, headers });
  }

  return redirectWithCode(url);
}

async function getResume(req: BunRequest): Promise<Response> {
  const pending = getCookie(req, OAUTH_RETURN_COOKIE);
  if (!pending) {
    return Response.redirect(new URL("/", req.url), 302);
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
