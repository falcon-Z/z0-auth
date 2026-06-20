import type {
  CreateServiceGroupRequest,
  PatchServiceGroupRequest,
  PutServiceGroupAppsRequest,
} from "@z0/contracts/service-groups";
import { parseJsonBody } from "@z0/contracts/validation";

import { validateCsrf } from "../../lib/csrf";
import { json, problem } from "../../lib/http";
import { requireScope } from "../../lib/platform-rbac";
import type { RoutedRequest } from "../../lib/path-router";
import { writeAuditEvent } from "../../lib/audit";
import {
  createServiceGroup,
  deleteServiceGroup,
  getServiceGroupForApi,
  listServiceGroupsForApi,
  patchServiceGroup,
  putServiceGroupApps,
} from "../../lib/service-groups";

export async function handleListServiceGroups(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "settings.service_groups:read");
  if (!auth.ok) return auth.response;
  const groups = await listServiceGroupsForApi();
  return json({ groups });
}

export async function handleGetServiceGroup(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "settings.service_groups:read");
  if (!auth.ok) return auth.response;

  const groupId = req.pathParams?.groupId ?? "";
  const result = await getServiceGroupForApi(groupId);
  if (!result.ok) return result.response;
  return json(result.group);
}

export async function handleCreateServiceGroup(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "settings.service_groups:create");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateServiceGroupRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createServiceGroup(parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "service_group.created",
    resourceType: "service_group",
    resourceId: result.group.id,
    payload: { slug: result.group.slug, ssoEnabled: result.group.ssoEnabled },
  });

  return json(result.group, { status: 201 });
}

export async function handlePatchServiceGroup(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "settings.service_groups:update");
  if (!auth.ok) return auth.response;

  const groupId = req.pathParams?.groupId ?? "";
  const parsed = await parseJsonBody<PatchServiceGroupRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await patchServiceGroup(groupId, parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "service_group.updated",
    resourceType: "service_group",
    resourceId: result.group.id,
    payload: { ssoEnabled: result.group.ssoEnabled },
  });

  return json(result.group);
}

export async function handlePutServiceGroupApps(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "settings.service_groups:update");
  if (!auth.ok) return auth.response;

  const groupId = req.pathParams?.groupId ?? "";
  const parsed = await parseJsonBody<PutServiceGroupAppsRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await putServiceGroupApps(groupId, parsed.body);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "service_group.apps_updated",
    resourceType: "service_group",
    resourceId: result.group.id,
    payload: { appCount: result.group.apps.length },
  });

  return json(result.group);
}

export async function handleDeleteServiceGroup(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "settings.service_groups:delete");
  if (!auth.ok) return auth.response;

  const groupId = req.pathParams?.groupId ?? "";
  const result = await deleteServiceGroup(groupId);
  if (!result.ok) return result.response;

  await writeAuditEvent({
    actorUserId: auth.userId,
    action: "service_group.deleted",
    resourceType: "service_group",
    resourceId: groupId,
  });

  return new Response(null, { status: 204 });
}
