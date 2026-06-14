import type { CreateAppRequest, CreateCredentialRequest, PatchAppRequest } from "@z0/contracts/apps";
import { parseJsonBody } from "@z0/contracts/validation";

import {
  createApp,
  createCredential,
  getAppForApi,
  listAppsForApi,
  listCredentialsForApi,
  patchApp,
  revokeCredential,
  rotateCredential,
} from "../../lib/apps";
import { json } from "../../lib/http";
import { requireScope } from "../../lib/platform-rbac";
import type { RoutedRequest } from "../../lib/path-router";

export async function handleListApps(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "apps:read");
  if (!auth.ok) return auth.response;
  const apps = await listAppsForApi();
  return json({ apps });
}

export async function handleCreateApp(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "apps:create");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateAppRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createApp(parsed.body);
  if (!result.ok) return result.response;
  return json(result.app, { status: 201 });
}

export async function handleGetApp(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const auth = await requireScope(req, "apps:read");
  if (!auth.ok) return auth.response;

  const result = await getAppForApi(appId);
  if (!result.ok) return result.response;
  return json(result.app);
}

export async function handlePatchApp(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const auth = await requireScope(req, "apps:update");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<PatchAppRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await patchApp(appId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.app);
}

export async function handleListCredentials(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const auth = await requireScope(req, "apps.credentials:read");
  if (!auth.ok) return auth.response;

  const result = await listCredentialsForApi(appId);
  if (!result.ok) return result.response;
  return json({ credentials: result.credentials });
}

export async function handleCreateCredential(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const auth = await requireScope(req, "apps.credentials:create");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateCredentialRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createCredential(appId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.data, { status: 201 });
}

export async function handleRevokeCredential(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const credentialId = req.pathParams?.credentialId ?? "";
  const auth = await requireScope(req, "apps.credentials:revoke");
  if (!auth.ok) return auth.response;

  const result = await revokeCredential(appId, credentialId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}

export async function handleRotateCredential(req: RoutedRequest): Promise<Response> {
  const appId = req.pathParams?.appId ?? "";
  const credentialId = req.pathParams?.credentialId ?? "";
  const auth = await requireScope(req, "apps.credentials:rotate");
  if (!auth.ok) return auth.response;

  const result = await rotateCredential(appId, credentialId);
  if (!result.ok) return result.response;
  return json(result.data);
}
