import { ErrorCodes } from "@z0/contracts/errors";
import type {
  CreateResourceRequest,
  PatchResourceRequest,
  PutClientResourcePermissionRequest,
} from "@z0/contracts/resources";
import { parseJsonBody } from "@z0/contracts/validation";
import {
  createResource,
  listResources,
  listAvailableResources,
  patchResource,
  listClientResources,
  putClientResource,
} from "../../lib/oauth-resources";
import { validateCsrf } from "../../lib/csrf";
import { requireScope } from "../../lib/platform-rbac";
import { requireRecentConsoleMfa } from "../../lib/mfa";
import { writeAuditEvent } from "../../lib/audit";
import { json, problem } from "../../lib/http";
import type { RoutedRequest } from "../../lib/path-router";

export async function handleAvailableResources(req: RoutedRequest) {
  const auth = await requireScope(req, "apps.resources:read");
  return auth.ok
    ? json({ resources: await listAvailableResources() })
    : auth.response;
}
export async function handleListResources(req: RoutedRequest) {
  const auth = await requireScope(req, "apps.resources:read");
  if (!auth.ok) return auth.response;
  const result = await listResources(req.pathParams?.appId ?? "");
  return result.ok ? json({ resources: result.resources }) : result.response;
}
async function mutateResource(
  req: RoutedRequest,
  operation: "create" | "update" | "retire",
) {
  const csrf = validateCsrf(req);
  if (csrf) return csrf;
  const auth = await requireScope(req, "apps.resources:manage");
  if (!auth.ok) return auth.response;
  const mfa = await requireRecentConsoleMfa(req, auth.userId);
  if (mfa) return mfa;
  const appId = req.pathParams?.appId ?? "";
  const parsed =
    operation === "retire"
      ? { ok: true as const, body: {} }
      : await parseJsonBody<CreateResourceRequest & PatchResourceRequest>(req);
  if (!parsed.ok) return parsed.response;
  const result =
    operation === "create"
      ? await createResource(appId, parsed.body as CreateResourceRequest)
      : await patchResource(
          appId,
          req.pathParams?.resourceId ?? "",
          parsed.body,
          operation === "retire",
        );
  if (!result.ok) return result.response;
  await writeAuditEvent({
    actorUserId: auth.userId,
    action: `resource.${operation}`,
    resourceType: "oauth_resource",
    resourceId: result.resource.id,
    payload: { appId },
  });
  return json(result.resource, { status: operation === "create" ? 201 : 200 });
}
export const handleCreateResource = (req: RoutedRequest) =>
  mutateResource(req, "create");
export const handlePatchResource = (req: RoutedRequest) =>
  mutateResource(req, "update");
export const handleDeleteResource = (req: RoutedRequest) =>
  mutateResource(req, "retire");
export async function handleListClientResources(req: RoutedRequest) {
  const auth = await requireScope(req, "apps.clients:read");
  if (!auth.ok) return auth.response;
  const result = await listClientResources(
    req.pathParams?.appId ?? "",
    req.pathParams?.clientId ?? "",
  );
  return result.ok
    ? json({ permissions: result.permissions })
    : result.response;
}
async function mutateClientResource(req: RoutedRequest, remove = false) {
  const csrf = validateCsrf(req);
  if (csrf) return csrf;
  const auth = await requireScope(req, "apps.clients:update");
  if (!auth.ok) return auth.response;
  const mfa = await requireRecentConsoleMfa(req, auth.userId);
  if (mfa) return mfa;
  const parsed = remove
    ? { ok: true as const, body: { scopes: [] } }
    : await parseJsonBody<PutClientResourcePermissionRequest>(req);
  if (!parsed.ok) return parsed.response;
  if (Object.keys(parsed.body).some((key) => key !== "scopes"))
    return problem(
      400,
      "Validation Error",
      "Only scopes may be configured on a resource permission.",
      { code: ErrorCodes.RESOURCE_CONFIGURATION_INVALID },
    );
  const appId = req.pathParams?.appId ?? "",
    clientId = req.pathParams?.clientId ?? "",
    resourceId = req.pathParams?.resourceId ?? "";
  const result = await putClientResource(
    appId,
    clientId,
    resourceId,
    parsed.body.scopes,
    remove,
  );
  if (!result.ok) return result.response;
  await writeAuditEvent({
    actorUserId: auth.userId,
    action: remove ? "client.resource_removed" : "client.resource_configured",
    resourceType: "oauth_client",
    resourceId: clientId,
    payload: { appId, resourceId },
  });
  return json({ ok: true });
}
export const handlePutClientResource = (req: RoutedRequest) =>
  mutateClientResource(req);
export const handleDeleteClientResource = (req: RoutedRequest) =>
  mutateClientResource(req, true);
