import type {
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

export async function fetchAppUsers(appId: string, q?: string): Promise<AppUserSummary[]> {
  const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  const { users } = await apiFetch<{ users: AppUserSummary[] }>(
    `/api/v1/apps/${appId}/users${query}`,
  );
  return users;
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
