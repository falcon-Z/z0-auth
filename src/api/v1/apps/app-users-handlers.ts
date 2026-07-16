import type {
  CreateAppUserInviteRequest,
  CreateAppUserRequest,
  PatchAppUserRequest,
} from "@z0/contracts/app-users";
import { parseJsonBody } from "@z0/contracts/validation";
import { ErrorCodes } from "@z0/contracts/errors";

import { validateCsrf } from "../../lib/csrf";
import {
  createAppUserForApi,
  createAppUserInviteForApi,
  getAppUserDetailForApi,
  listAppUsersForApi,
  listPendingAppUserInvites,
  patchAppUserForApi,
  transitionAppUserForApi,
  revokeAppUserInvite,
} from "../../lib/app-users";
import { json, problem } from "../../lib/http";
import { requireScope } from "../../lib/platform-rbac";
import type { RoutedRequest } from "../../lib/path-router";
import { issueAppEmailVerification } from "../../lib/app-email-verification";
import { issueAppUserAdminReset } from "../../lib/admin-reset";

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
  const auth = await requireScope(req, "apps.users:read");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const rawStatus = url.searchParams.get("status") ?? undefined;
  if (rawStatus && rawStatus !== "active" && rawStatus !== "disabled" && rawStatus !== "locked" && rawStatus !== "deleted") {
    return problem(400, "Validation Error", "Invalid account status filter.", {
      errors: [{ field: "status", code: ErrorCodes.REQUIRED, message: "Status must be active, disabled, locked, or deleted" }],
    });
  }
  const status = rawStatus === "active" || rawStatus === "disabled" || rawStatus === "locked" || rawStatus === "deleted"
    ? rawStatus
    : undefined;

  const result = await listAppUsersForApi(appId, q, status);
  if (!result.ok) return result.response;
  return json({ users: result.users });
}

export async function handleCreateAppUser(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const appId = appIdFrom(req);
  const auth = await requireScope(req, "apps.users:manage");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<CreateAppUserRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await createAppUserForApi(appId, auth.userId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.user, { status: 201 });
}

export async function handleGetAppUser(req: RoutedRequest): Promise<Response> {
  const appId = appIdFrom(req);
  const auth = await requireScope(req, "apps.users:read");
  if (!auth.ok) return auth.response;

  const result = await getAppUserDetailForApi(appId, userIdFrom(req));
  if (!result.ok) return result.response;
  return json(result.user);
}

export async function handlePatchAppUser(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const appId = appIdFrom(req);
  const auth = await requireScope(req, "apps.users:manage");
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<PatchAppUserRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await patchAppUserForApi(appId, userIdFrom(req), auth.userId, parsed.body);
  if (!result.ok) return result.response;
  return json(result.user);
}

export async function handleAppUserLifecycle(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const appId = appIdFrom(req);
  const auth = await requireScope(req, "apps.users:manage");
  if (!auth.ok) return auth.response;
  const action = req.pathParams?.action ?? "";
  if (action !== "disable" && action !== "enable" && action !== "unlock" && action !== "delete" && action !== "restore" && action !== "permanently-delete") {
    return new Response("Not found", { status: 404 });
  }
  const body = await req.json().catch(() => ({})) as { confirmationEmail?: string };
  const result = await transitionAppUserForApi(appId, userIdFrom(req), auth.userId, action, body.confirmationEmail);
  if (!result.ok) return result.response;
  return result.user ? json(result.user) : json({ ok: true });
}

export async function handleAppUserVerification(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const appId = appIdFrom(req);
  const auth = await requireScope(req, "apps.users:manage");
  if (!auth.ok) return auth.response;
  const detail = await getAppUserDetailForApi(appId, userIdFrom(req));
  if (!detail.ok) return detail.response;
  const delivery = await issueAppEmailVerification(req, detail.user.userId, auth.userId);
  return json({ ok: true, emailDelivery: delivery.status, alreadyVerified: Boolean(delivery.alreadyVerified) });
}

export async function handleAppUserAdminReset(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const appId = appIdFrom(req);
  const auth = await requireScope(req, "apps.users:manage");
  if (!auth.ok) return auth.response;
  const result = await issueAppUserAdminReset(req, appId, userIdFrom(req), auth.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}

export async function handleListAppUserInvites(req: RoutedRequest): Promise<Response> {
  const appId = appIdFrom(req);
  const auth = await requireScope(req, "apps.users:read");
  if (!auth.ok) return auth.response;

  const result = await listPendingAppUserInvites(appId);
  if (!result.ok) return result.response;
  return json({ invites: result.invites });
}

export async function handleCreateAppUserInvite(req: RoutedRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const appId = appIdFrom(req);
  const auth = await requireScope(req, "apps.users:manage");
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
  const auth = await requireScope(req, "apps.users:manage");
  if (!auth.ok) return auth.response;

  const result = await revokeAppUserInvite(appId, inviteIdFrom(req), auth.userId);
  if (!result.ok) return result.response;
  return json({ ok: true });
}
