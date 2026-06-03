import type {
  AppDetail,
  AppSummary,
  CreateAppRequest,
  CreateCredentialRequest,
  CreateCredentialResponse,
  PatchAppRequest,
  AppCredentialSummary,
  RotateCredentialResponse,
} from "@z0/contracts/apps";

import { apiFetch } from "./http-client";

export async function fetchApps(): Promise<AppSummary[]> {
  const { apps } = await apiFetch<{ apps: AppSummary[] }>("/api/v1/apps");
  return apps;
}

export async function fetchApp(appId: string): Promise<AppDetail> {
  return apiFetch<AppDetail>(`/api/v1/apps/${appId}`);
}

export async function createApp(body: CreateAppRequest): Promise<AppDetail> {
  return apiFetch<AppDetail>("/api/v1/apps", { method: "POST", body });
}

export async function patchApp(appId: string, body: PatchAppRequest): Promise<AppDetail> {
  return apiFetch<AppDetail>(`/api/v1/apps/${appId}`, { method: "PATCH", body });
}

export async function fetchAppCredentials(appId: string): Promise<AppCredentialSummary[]> {
  const { credentials } = await apiFetch<{ credentials: AppCredentialSummary[] }>(
    `/api/v1/apps/${appId}/credentials`,
  );
  return credentials;
}

export async function createAppCredential(
  appId: string,
  body: CreateCredentialRequest = {},
): Promise<CreateCredentialResponse> {
  return apiFetch<CreateCredentialResponse>(`/api/v1/apps/${appId}/credentials`, {
    method: "POST",
    body,
  });
}

export async function revokeAppCredential(appId: string, credentialId: string): Promise<void> {
  await apiFetch(`/api/v1/apps/${appId}/credentials/${credentialId}`, { method: "DELETE" });
}

export async function rotateAppCredential(
  appId: string,
  credentialId: string,
): Promise<RotateCredentialResponse> {
  return apiFetch<RotateCredentialResponse>(
    `/api/v1/apps/${appId}/credentials/${credentialId}/rotate`,
    { method: "POST" },
  );
}
