import type { PlatformUserDetail, PlatformUserSummary, UserStatus } from "@z0/contracts/users";

import { apiFetch } from "./http-client";

export async function fetchPlatformUsers(): Promise<PlatformUserSummary[]> {
  const { users } = await apiFetch<{ users: PlatformUserSummary[] }>("/api/v1/users");
  return users;
}

export async function fetchPlatformUser(userId: string): Promise<PlatformUserDetail> {
  return apiFetch<PlatformUserDetail>(`/api/v1/users/${userId}`);
}

export async function updateUserStatus(userId: string, status: UserStatus): Promise<PlatformUserSummary> {
  return apiFetch<PlatformUserSummary>(`/api/v1/users/${userId}`, {
    method: "PATCH",
    body: { status },
  });
}

export async function changePassword(body: {
  currentPassword: string;
  password: string;
  passwordConfirm: string;
}): Promise<void> {
  await apiFetch("/api/auth/change-password", {
    method: "POST",
    body,
  });
}
