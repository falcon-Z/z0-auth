import type { CreateAppScopeRequest, PatchAppScopeRequest } from "@z0/contracts/app-scopes";
import { parseJsonBody } from "@z0/contracts/validation";

import {
  createScopeForApi,
  deleteScopeForApi,
  listScopesForApi,
  patchScopeForApi,
} from "../../lib/app-scopes";
import { json } from "../../lib/http";
import { requireInstanceMember } from "../../lib/instance-members";
import type { RoutedRequest } from "../../lib/path-router";

export async function handleListScopes(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const result = await listScopesForApi(appId);
  if (!result.ok) return result.response;
  return json({ scopes: result.scopes });
}

export async function handleCreateScope(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateAppScopeRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createScopeForApi(appId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.scope, { status: 201 });
}

export async function handlePatchScope(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const scopeId = req.pathParams?.scopeId ?? "";
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<PatchAppScopeRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await patchScopeForApi(appId, scopeId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.scope);
}

export async function handleDeleteScope(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const scopeId = req.pathParams?.scopeId ?? "";
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const result = await deleteScopeForApi(appId, scopeId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}
