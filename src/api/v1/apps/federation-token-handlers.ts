import { validateCsrf } from "../../lib/csrf";
import { json } from "../../lib/http";
import { requireConsoleOrAppBearer } from "../../lib/app-api-auth";
import type { RoutedRequest } from "../../lib/path-router";
import { auditFederationTokenAccess, getFederationUserToken, refreshFederationUserToken } from "../../lib/federation-tokens";

export async function handleGetFederationUserToken(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const userId = req.pathParams?.userId ?? "";
  const providerId = req.pathParams?.providerId ?? "";

  const auth = await requireConsoleOrAppBearer(req, {
    appId,
    consoleScope: "apps.federation:read",
    bearerScope: "federation:token",
    targetUserId: userId,
  });
  if (!auth.ok) return auth.response;

  const result = await getFederationUserToken({ appId, userId, providerId });
  if (!result.ok) return result.response;

  await auditFederationTokenAccess({
    appId,
    userId,
    providerId,
    actorUserId: auth.auth.mode === "console" ? auth.auth.userId : undefined,
    actorMode: auth.auth.mode,
    refreshed: result.token.refreshed,
  });

  return json(result.token);
}

export async function handleRefreshFederationUserToken(req: RoutedRequest): Promise<Response> {
  const hasBearer = Boolean(req.headers.get("authorization")?.toLowerCase().startsWith("bearer "));
  if (!hasBearer) {
    const csrfError = validateCsrf(req);
    if (csrfError) return csrfError;
  }

  const appId = req.pathParams?.appId ?? "";
  const userId = req.pathParams?.userId ?? "";
  const providerId = req.pathParams?.providerId ?? "";

  const auth = await requireConsoleOrAppBearer(req, {
    appId,
    consoleScope: "apps.federation:manage",
    bearerScope: "federation:token",
    targetUserId: userId,
  });
  if (!auth.ok) return auth.response;

  const result = await refreshFederationUserToken({
    appId,
    userId,
    providerId,
    actorUserId: auth.auth.mode === "console" ? auth.auth.userId : undefined,
    actorMode: auth.auth.mode,
  });
  if (!result.ok) return result.response;

  return json(result.token);
}
