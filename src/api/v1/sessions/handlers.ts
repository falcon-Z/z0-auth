import type { RoutedRequest } from "../../lib/path-router";
import { validateCsrf } from "../../lib/csrf";
import { json } from "../../lib/http";
import { requireSession } from "../../lib/auth";
import {
  listActiveSessionsForUser,
  revokeAllOtherSessionsForUser,
  revokeSessionClearCookieHeader,
  revokeUserSession,
} from "../../lib/sessions-mgmt";

function sessionIdFrom(req: RoutedRequest): string {
  return req.pathParams?.sessionId ?? "";
}

export async function handleListSessions(req: RoutedRequest): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const sessions = await listActiveSessionsForUser(auth.userId, auth.sessionId);
  return json({ sessions });
}

export async function handleRevokeSession(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const result = await revokeUserSession(auth.userId, auth.sessionId, sessionIdFrom(req), req);
  if (!result.ok) return result.response;

  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (result.clearCookie) {
    headers.set("Set-Cookie", revokeSessionClearCookieHeader());
  }

  return new Response(
    JSON.stringify({ ok: true, revokedCurrent: result.revokedCurrent }),
    { status: 200, headers },
  );
}

export async function handleRevokeOtherSessions(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const revokedCount = await revokeAllOtherSessionsForUser(auth.userId, auth.sessionId);
  return json({ ok: true, revokedCount });
}
