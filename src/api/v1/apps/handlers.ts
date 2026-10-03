import type { RegistrationLifecycleRequest } from "@z0/contracts/apps";
import { registrationLifecycle, prepareRegistrationVerification } from "../../lib/registration-lifecycle";
import { loadConfig } from "../../lib/config";
import { getDb } from "../../lib/db";
import { resolveSession } from "../../lib/session";
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
} from "../../lib/oauth-clients";
import { writeAuditEvent } from "../../lib/audit";
import { validateCsrf } from "../../lib/csrf";
import { json, problem } from "../../lib/http";
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

  const result = await createApp(parsed.body, auth.userId);
  if (!result.ok) return result.response;

  return json(result.data, { status: 201, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
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
  operation: "create" | "update",
) {
  const csrf = validateCsrf(req);
  if (csrf) return csrf;
  const auth = await requireScope(req, `apps.clients:${operation}`);
  if (!auth.ok) return auth.response;
  const stepUp = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUp) return stepUp;
  const appId = req.pathParams?.appId ?? "";
  const id = req.pathParams?.clientId ?? "";
  const parsed = await parseJsonBody<CreateClientRequest & PatchClientRequest>(req);
  if (!parsed.ok) return parsed.response;
  const result = operation === "create"
    ? await createClient(appId, parsed.body, auth.userId)
    : await patchClient(appId, id, parsed.body);
  if (!result.ok) return result.response;
  const client = "data" in result ? result.data.client : result.client;
  if (operation === "update") await writeAuditEvent({
    actorUserId: auth.userId,
    action: "client.updated",
    resourceType: "oauth_client",
    resourceId: client.id,
    payload: { appId, status: client.status },
  });
  return json("data" in result ? result.data : result.client, {
    status: operation === "create" ? 201 : 200,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
}
export async function handleCreateClient(req: RoutedRequest) {
  return clientMutation(req, "create");
}
export async function handlePatchClient(req: RoutedRequest) {
  return clientMutation(req, "update");
}

export async function handleRegistrationLifecyclePolicy(req: RoutedRequest) {
  const auth = await requireScope(req, "apps:read");
  if (!auth.ok) return auth.response;
  return json({ graceDays: loadConfig().registrationDeletionGraceDays });
}
export async function handleRegistrationLifecycle(req: RoutedRequest) {
  const csrf = validateCsrf(req);
  if (csrf) return csrf;
  const appId = req.pathParams?.appId ?? "";
  const clientId = req.pathParams?.clientId;
  const auth = await requireScope(req, clientId ? "apps.clients:delete" : "apps:delete");
  if (!auth.ok) return auth.response;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(appId) || (clientId && !uuid.test(clientId))) return problem(404, "Not Found", "Registration not found.");
  const parsed = await parseJsonBody<RegistrationLifecycleRequest>(req);
  if (!parsed.ok) return parsed.response;
  if (Object.keys(parsed.body).some(key => !["action", "confirmation", "expectedGraceDays"].includes(key)) || !["delete", "restore", "purge"].includes(parsed.body.action)) return problem(400, "Validation Error", "Choose delete, restore or purge.");
  if (parsed.body.action === "delete" && parsed.body.expectedGraceDays !== loadConfig().registrationDeletionGraceDays)
    return problem(409, "Conflict", "The deletion grace policy changed or was not confirmed. Review it before deleting.");
  const [target] = clientId
    ? await getDb()`SELECT status, client_id AS confirmation FROM oauth_clients WHERE id = ${clientId} AND app_id = ${appId}`
    : await getDb()`SELECT status, id::text AS confirmation FROM apps WHERE id = ${appId}`;
  if (!target) return problem(404, "Not Found", "Registration not found.");
  if (parsed.body.action !== "restore" && parsed.body.confirmation !== target.confirmation)
    return problem(400, "Validation Error", "Confirm the exact Application ID or Client ID.");
  if ((parsed.body.action === "delete") === (target.status === "pending_deletion"))
    return problem(409, "Conflict", "Delete enters Pending Deletion; restore and purge require Pending Deletion.");
  const session = await resolveSession(req);
  if (!session || session.userId !== auth.userId) return problem(401, "Unauthorized", "Authentication required.");
  const proof = parsed.body.action !== "restore" ? await prepareRegistrationVerification({
    token: req.headers.get("X-Registration-Verification"), sessionId: session.sessionId, actorUserId: auth.userId,
    appId, clientId, action: parsed.body.action, graceDays: parsed.body.action === "delete" ? parsed.body.expectedGraceDays : undefined,
  }) : undefined;
  if (proof === null) return problem(403, "Forbidden", "Verification expired, consumed or does not match this action.");
  const stepUp = await requireRecentConsoleMfa(req, auth.userId, proof?.issuedAt);
  if (stepUp) {
    if (!proof) return stepUp;
    const detail = await stepUp.json();
    return json({ ...detail, registrationVerification: proof.token }, { status: stepUp.status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
  }
  const verifiedSession = await resolveSession(req);
  if (!verifiedSession || verifiedSession.userId !== auth.userId) return problem(401, "Unauthorized", "Authentication required.");
  const result = await registrationLifecycle({ appId, clientId, body: parsed.body, actorUserId: auth.userId,
    sessionId: session.sessionId, verificationHash: proof?.hash,
    verifiedAt: new Date(Math.max(verifiedSession.primaryAuthenticatedAt.getTime(), verifiedSession.mfaAuthenticatedAt?.getTime() ?? 0)) });
  return result.ok ? json(result.data) : result.response;
}
