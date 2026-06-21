import type { CreateAppScopeRequest, PatchAppScopeRequest } from "@z0/contracts/app-scopes";
import { parseJsonBody } from "@z0/contracts/validation";

import {
  createScopeForApi,
  deleteScopeForApi,
  listScopesForApi,
  patchScopeForApi,
} from "../../lib/app-scopes";
import { writeAuditEvent } from "../../lib/audit";
import { json } from "../../lib/http";
import { requireScope } from "../../lib/platform-rbac";
import type { RoutedRequest } from "../../lib/path-router";

export async function handleListScopes(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const auth = await requireScope(req, "apps.scopes:read");
  if (!auth.ok) return auth.response;

  const result = await listScopesForApi(appId);
  if (!result.ok) return result.response;
  return json({ scopes: result.scopes });
}

export async function handleCreateScope(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const auth = await requireScope(req, "apps.scopes:manage");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateAppScopeRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createScopeForApi(appId, parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "scope.created",
    resourceType: "scope",
    resourceId: result.scope.id,
    payload: { appId, name: result.scope.name },
  });

  return json(result.scope, { status: 201 });
}

export async function handlePatchScope(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const scopeId = req.pathParams?.scopeId ?? "";
  const auth = await requireScope(req, "apps.scopes:manage");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<PatchAppScopeRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await patchScopeForApi(appId, scopeId, parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "scope.updated",
    resourceType: "scope",
    resourceId: scopeId,
    payload: { appId },
  });

  return json(result.scope);
}

export async function handleDeleteScope(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const scopeId = req.pathParams?.scopeId ?? "";
  const auth = await requireScope(req, "apps.scopes:manage");
  if (!auth.ok) return auth.response;

  const result = await deleteScopeForApi(appId, scopeId);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "scope.deleted",
    resourceType: "scope",
    resourceId: scopeId,
    payload: { appId },
  });

  return json({ ok: true });
}
