import type {
  CreateAppUserInviteRequest,
  CreateAppUserRequest,
  PatchAppUserRequest,
} from "@z0/contracts/app-users";
import { parseJsonBody } from "@z0/contracts/validation";

import { validateCsrf } from "../../lib/csrf";
import {
  createAppUserForApi,
  createAppUserInviteForApi,
  getAppUserDetailForApi,
  listAppUsersForApi,
  listPendingAppUserInvites,
  patchAppUserForApi,
  revokeAppUserInvite,
} from "../../lib/app-users";
import { json } from "../../lib/http";
import { requireInstanceMember } from "../../lib/instance-members";
import type { RoutedRequest } from "../../lib/path-router";

function appIdFrom(req: RoutedRequest): string {
  return req.pathParams?.appId ?? "";
}

function userIdFrom(req: RoutedRequest): string {
  return req.pathParams?.userId ?? "";
}

function inviteIdFrom(req: RoutedRequest): string {
  return req.pathParams?.inviteId ?? "";
}

export async function handleListAppUsers(req: RoutedRequest): Promise<Response> {
  const appId = appIdFrom(req);
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;

  const result = await listAppUsersForApi(appId, q);
  if (!result.ok) return result.response;
  return json({ users: result.users });
}

export async function handleCreateAppUser(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const appId = appIdFrom(req);
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateAppUserRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createAppUserForApi(appId, auth.userId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.user, { status: 201 });
}

export async function handleGetAppUser(req: RoutedRequest): Promise<Response> {
  const appId = appIdFrom(req);
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const result = await getAppUserDetailForApi(appId, userIdFrom(req));
  if (!result.ok) return result.response;
  return json(result.user);
}

export async function handlePatchAppUser(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const appId = appIdFrom(req);
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<PatchAppUserRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await patchAppUserForApi(appId, userIdFrom(req), auth.userId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.user);
}

export async function handleListAppUserInvites(req: RoutedRequest): Promise<Response> {
  const appId = appIdFrom(req);
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const result = await listPendingAppUserInvites(appId);
  if (!result.ok) return result.response;
  return json({ invites: result.invites });
}

export async function handleCreateAppUserInvite(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const appId = appIdFrom(req);
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateAppUserInviteRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createAppUserInviteForApi(req, appId, auth.userId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.data, { status: 201 });
}

export async function handleRevokeAppUserInvite(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const appId = appIdFrom(req);
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const result = await revokeAppUserInvite(appId, inviteIdFrom(req), auth.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}
