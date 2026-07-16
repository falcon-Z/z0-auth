import type {
  AccountLifecycleAction,
  AppUserDetail,
  AppUserSummary,
  CreateAppUserInviteRequest,
  CreateAppUserInviteResponse,
  CreateAppUserRequest,
  PatchAppUserRequest,
  PendingAppUserInvite,
} from "@z0/contracts/app-users";

import { apiFetch } from "./http-client";

export async function fetchAppUser(appId: string, userId: string): Promise<AppUserDetail> {
  return apiFetch<AppUserDetail>(`/api/v1/apps/${appId}/users/${userId}`);
}

export async function fetchAppUsers(appId: string, q?: string, status?: AppUserSummary["status"]): Promise<AppUserSummary[]> {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  const query = params.size ? `?${params.toString()}` : "";
  const { users } = await apiFetch<{ users: AppUserSummary[] }>(
    `/api/v1/apps/${appId}/users${query}`,
  );
  return users;
}

export async function transitionAppUser(
  appId: string,
  userId: string,
  action: AccountLifecycleAction,
  confirmationEmail?: string,
): Promise<AppUserDetail | { ok: true }> {
  return apiFetch(`/api/v1/apps/${appId}/users/${userId}/lifecycle/${action}`, {
    method: "POST",
    body: confirmationEmail ? { confirmationEmail } : {},
  });
}

export async function sendAppUserVerification(appId: string, userId: string): Promise<void> {
  await apiFetch(`/api/v1/apps/${appId}/users/${userId}/verification`, { method: "POST", body: {} });
}

export async function sendAppUserPasswordReset(appId: string, userId: string): Promise<void> {
  await apiFetch(`/api/v1/apps/${appId}/users/${userId}/password-reset`, { method: "POST", body: {} });
}

export async function resetAppUserMfa(appId: string, userId: string): Promise<void> {
  await apiFetch(`/api/v1/apps/${appId}/users/${userId}/mfa-reset`, { method: "POST", body: {} });
}

export async function createAppUser(
  appId: string,
  body: CreateAppUserRequest,
): Promise<AppUserDetail> {
  return apiFetch<AppUserDetail>(`/api/v1/apps/${appId}/users`, { method: "POST", body });
}

export async function patchAppUser(
  appId: string,
  userId: string,
  body: PatchAppUserRequest,
): Promise<AppUserDetail> {
  return apiFetch<AppUserDetail>(`/api/v1/apps/${appId}/users/${userId}`, {
    method: "PATCH",
    body,
  });
}

export async function fetchAppUserInvites(appId: string): Promise<PendingAppUserInvite[]> {
  const { invites } = await apiFetch<{ invites: PendingAppUserInvite[] }>(
    `/api/v1/apps/${appId}/users/invites`,
  );
  return invites;
}

export async function createAppUserInvite(
  appId: string,
  body: CreateAppUserInviteRequest,
): Promise<CreateAppUserInviteResponse> {
  return apiFetch<CreateAppUserInviteResponse>(`/api/v1/apps/${appId}/users/invites`, {
    method: "POST",
    body,
  });
}

export async function revokeAppUserInvite(appId: string, inviteId: string): Promise<void> {
  await apiFetch(`/api/v1/apps/${appId}/users/invites/${inviteId}`, { method: "DELETE" });
}
