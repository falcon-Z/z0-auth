import type {
  AppSignInSettingsResponse,
  InstanceSignInSettingsResponse,
  PutAppSignInSettingsRequest,
  PutInstanceSignInSettingsRequest,
} from "@z0/contracts/auth-settings";

import { apiFetch } from "./http-client";

export async function fetchInstanceSignInSettings(): Promise<InstanceSignInSettingsResponse> {
  return apiFetch<InstanceSignInSettingsResponse>("/api/v1/settings/sign-in");
}

export async function putInstanceSignInSettings(
  body: PutInstanceSignInSettingsRequest,
): Promise<InstanceSignInSettingsResponse> {
  return apiFetch<InstanceSignInSettingsResponse>("/api/v1/settings/sign-in", {
    method: "PUT",
    body,
  });
}

export async function fetchAppSignInSettings(appId: string): Promise<AppSignInSettingsResponse> {
  return apiFetch<AppSignInSettingsResponse>(`/api/v1/apps/${appId}/sign-in`);
}

export async function putAppSignInSettings(
  appId: string,
  body: PutAppSignInSettingsRequest,
): Promise<AppSignInSettingsResponse> {
  return apiFetch<AppSignInSettingsResponse>(`/api/v1/apps/${appId}/sign-in`, {
    method: "PUT",
    body,
  });
}
