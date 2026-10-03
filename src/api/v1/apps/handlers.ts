import type {
  CreateAppRequest,
  CreateClientRequest,
  PatchAppRequest,
  PatchClientRequest,
} from "@z0/contracts/apps";
import { parseJsonBody } from "@z0/contracts/validation";

import {
  createApp,
  getAppForApi,
  listAppsForApi,
  patchApp,
} from "../../lib/apps";
import {
  createClient,
  listClientsForApi,
  patchClient,
  rotateClientSecret,
} from "../../lib/oauth-clients";
import { writeAuditEvent } from "../../lib/audit";
import { validateCsrf } from "../../lib/csrf";
import { json } from "../../lib/http";
import { requireScope } from "../../lib/platform-rbac";
import type { RoutedRequest } from "../../lib/path-router";
import { requireRecentConsoleMfa } from "../../lib/mfa";

export async function handleListApps(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "apps:read");
  if (!auth.ok) return auth.response;
  const apps = await listAppsForApi();
  return json({ apps });
}

export async function handleCreateApp(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "apps:create");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateAppRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createApp(parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "app.created",
    resourceType: "app",
    resourceId: result.data.app.id,
    payload: {
      slug: result.data.app.slug,
      minimumAssurance: result.data.app.minimumAssurance,
    },
  });

  return json(result.data, { status: 201 });
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
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const appId = req.pathParams?.appId ?? "";
  const auth = await requireScope(req, "apps:update");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<PatchAppRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await patchApp(appId, parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "app.updated",
    resourceType: "app",
    resourceId: appId,
    payload: { status: result.app.status },
  });

  return json(result.app);
}

export async function handleListClients(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "apps.clients:read");
  if (!auth.ok) return auth.response;
  const result = await listClientsForApi(req.pathParams?.appId ?? "");
  return result.ok ? json({ clients: result.clients }) : result.response;
}
async function clientMutation(
  req: RoutedRequest,
  operation: "create" | "update" | "rotate",
) {
  const csrf = validateCsrf(req);
  if (csrf) return csrf;
  const auth = await requireScope(req, `apps.clients:${operation}`);
  if (!auth.ok) return auth.response;
  const stepUp = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUp) return stepUp;
  const appId = req.pathParams?.appId ?? "";
  const id = req.pathParams?.clientId ?? "";
  const parsed =
    operation === "rotate"
      ? null
      : await parseJsonBody<CreateClientRequest & PatchClientRequest>(req);
  if (parsed && !parsed.ok) return parsed.response;
  const result =
    operation === "create"
      ? await createClient(appId, parsed!.body)
      : operation === "update"
        ? await patchClient(appId, id, parsed!.body)
        : await rotateClientSecret(appId, id);
  if (!result.ok) return result.response;
  const client = "data" in result ? result.data.client : result.client;
  await writeAuditEvent({
    actorUserId: auth.userId,
    action: `client.${operation === "create" ? "created" : operation === "update" ? "updated" : "secret_rotated"}`,
    resourceType: "oauth_client",
    resourceId: client.id,
    payload: { appId, status: client.status },
  });
  return json("data" in result ? result.data : result.client, {
    status: operation === "create" ? 201 : 200,
  });
}
export async function handleCreateClient(req: RoutedRequest) {
  return clientMutation(req, "create");
}
export async function handlePatchClient(req: RoutedRequest) {
  return clientMutation(req, "update");
}
export async function handleRotateClientSecret(req: RoutedRequest) {
  return clientMutation(req, "rotate");
}
