import type { RegistrationLifecycleRequest, RegistrationLifecycleResponse } from "@z0/contracts/apps";
import type {
  AppDetail,
  AppSummary,
  CreateAppRequest,
  CreateAppResponse,
  PatchAppRequest,
  CreateClientRequest,
  CreateClientResponse,
  OAuthClientSummary,
  PatchClientRequest,
  RotateClientSecretResponse,
} from "@z0/contracts/apps";
import { apiFetch } from "./http-client";
export async function fetchApps(): Promise<AppSummary[]> {
  return (await apiFetch<{ apps: AppSummary[] }>("/api/v1/apps")).apps;
}
export function fetchApp(appId: string) {
  return apiFetch<AppDetail>(`/api/v1/apps/${appId}`);
}
export function createApp(body: CreateAppRequest) {
  return apiFetch<CreateAppResponse>("/api/v1/apps", { method: "POST", body });
}
export function patchApp(appId: string, body: PatchAppRequest) {
  return apiFetch<AppDetail>(`/api/v1/apps/${appId}`, {
    method: "PATCH",
    body,
  });
}
export async function fetchAppClients(appId: string) {
  return (
    await apiFetch<{ clients: OAuthClientSummary[] }>(
      `/api/v1/apps/${appId}/clients`,
    )
  ).clients;
}
export function createAppClient(appId: string, body: CreateClientRequest) {
  return apiFetch<CreateClientResponse>(`/api/v1/apps/${appId}/clients`, {
    method: "POST",
    body,
  });
}
export function patchAppClient(
  appId: string,
  id: string,
  body: PatchClientRequest,
) {
  return apiFetch<OAuthClientSummary>(`/api/v1/apps/${appId}/clients/${id}`, {
    method: "PATCH",
    body,
  });
}
export function rotateAppClientSecret(appId: string, id: string) {
  return apiFetch<RotateClientSecretResponse>(
    `/api/v1/apps/${appId}/clients/${id}/rotate`,
    { method: "POST" },
  );
}

export function fetchRegistrationLifecyclePolicy() {
  return apiFetch<{ graceDays: number }>("/api/v1/registration-lifecycle-policy");
}
export function changeRegistrationLifecycle(appId: string, body: RegistrationLifecycleRequest, clientId?: string) {
  const path = clientId ? `/api/v1/apps/${appId}/clients/${clientId}/lifecycle` : `/api/v1/apps/${appId}/lifecycle`;
  return apiFetch<RegistrationLifecycleResponse<AppDetail | OAuthClientSummary>>(path, { method: "POST", body });
}
