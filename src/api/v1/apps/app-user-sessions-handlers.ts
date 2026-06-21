import type { RoutedRequest } from "../../lib/path-router";
import { validateCsrf } from "../../lib/csrf";
import { json } from "../../lib/http";
import { requireScope } from "../../lib/platform-rbac";
import {
  listActiveAppUserSessionsForAdmin,
  revokeAppUserSessionForAdmin,
} from "../../lib/app-sessions-mgmt";

function appIdFrom(req: RoutedRequest): string {
  return req.pathParams?.appId ?? "";
}

function userIdFrom(req: RoutedRequest): string {
  return req.pathParams?.userId ?? "";
}

function sessionIdFrom(req: RoutedRequest): string {
  return req.pathParams?.sessionId ?? "";
}

export async function handleListAppUserSessions(req: RoutedRequest): Promise<Response> {
  const appId = appIdFrom(req);
  const userId = userIdFrom(req);
  const auth = await requireScope(req, "apps.users:read");
  if (!auth.ok) return auth.response;

  const result = await listActiveAppUserSessionsForAdmin(appId, userId);
  if (!result.ok) return result.response;
  return json({ sessions: result.sessions });
}

export async function handleRevokeAppUserSession(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const appId = appIdFrom(req);
  const userId = userIdFrom(req);
  const auth = await requireScope(req, "apps.users:manage");
  if (!auth.ok) return auth.response;

  const result = await revokeAppUserSessionForAdmin(
    auth.userId,
    appId,
    userId,
    sessionIdFrom(req),
  );
  if (!result.ok) return result.response;
  return json({ ok: true });
}
