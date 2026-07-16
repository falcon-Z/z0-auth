import type {
  CreateRoleRequest,
  PatchRoleRequest,
  SetMemberRolesRequest,
  TransferOwnershipRequest,
} from "@z0/contracts/rbac";
import { ErrorCodes } from "@z0/contracts/errors";
import { parseJsonBody } from "@z0/contracts/validation";

import { validateCsrf } from "../../lib/csrf";
import {
  createInstanceRole,
  deleteInstanceRole,
  getInstanceRole,
  listInstanceRoles,
  patchInstanceRole,
} from "../../lib/instance-roles";
import { getMemberRolesForApi, setMemberRoles } from "../../lib/member-roles";
import { transferInstanceOwnership } from "../../lib/ownership";
import { listPlatformResources, requireScope } from "../../lib/platform-rbac";
import { json, problem } from "../../lib/http";
import type { RoutedRequest } from "../../lib/path-router";
import { requireRecentConsoleMfa } from "../../lib/mfa";

export async function handleListRbacResources(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "roles:read");
  if (!auth.ok) return auth.response;
  const resources = await listPlatformResources();
  return json({ resources });
}

export async function handleListRoles(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "roles:read");
  if (!auth.ok) return auth.response;
  const roles = await listInstanceRoles();
  return json({ roles });
}

export async function handleCreateRole(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "roles:manage");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateRoleRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createInstanceRole(parsed.body, auth.userId);
  if (!result.ok) return result.response;
  return json({ role: result.role }, { status: 201 });
}

export async function handleGetRole(req: RoutedRequest): Promise<Response> {
  const roleId = req.pathParams?.roleId ?? "";
  const auth = await requireScope(req, "roles:read");
  if (!auth.ok) return auth.response;

  const role = await getInstanceRole(roleId);
  if (!role) {
    return problem(404, "Not Found", "Role not found", {
      errors: [{ field: "roleId", code: ErrorCodes.USER_NOT_FOUND, message: "Role not found" }],
    });
  }
  return json({ role });
}

export async function handlePatchRole(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const roleId = req.pathParams?.roleId ?? "";
  const auth = await requireScope(req, "roles:manage");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<PatchRoleRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await patchInstanceRole(roleId, parsed.body, auth.userId);
  if (!result.ok) return result.response;
  return json({ role: result.role });
}

export async function handleDeleteRole(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const roleId = req.pathParams?.roleId ?? "";
  const auth = await requireScope(req, "roles:manage");
  if (!auth.ok) return auth.response;

  const result = await deleteInstanceRole(roleId, auth.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}

export async function handleGetMemberRoles(req: RoutedRequest): Promise<Response> {
  const userId = req.pathParams?.userId ?? "";
  const auth = await requireScope(req, "members:read");
  if (!auth.ok) return auth.response;

  const data = await getMemberRolesForApi(userId);
  if (!data) {
    return problem(404, "Not Found", "Member not found", {
      errors: [{ field: "userId", code: ErrorCodes.USER_NOT_FOUND, message: "Not a team member" }],
    });
  }
  return json(data);
}

export async function handleSetMemberRoles(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const userId = req.pathParams?.userId ?? "";
  const auth = await requireScope(req, "roles:manage");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<SetMemberRolesRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await setMemberRoles(userId, parsed.body, auth.userId);
  if (!result.ok) return result.response;
  return json({ userId, roles: result.roles });
}

export async function handleTransferOwnership(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireScope(req, "ownership:transfer");
  if (!auth.ok) return auth.response;
  const stepUpError = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUpError) return stepUpError;

  const parsed = await parseJsonBody<TransferOwnershipRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await transferInstanceOwnership(auth.userId, parsed.body);
  if (!result.ok) return result.response;
  return json({ ok: true });
}
