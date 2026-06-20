import type {
  AppFederationSettingsResponse,
  CreateCustomIdentityProviderRequest,
  CreateIdentityProviderFromTemplateRequest,
  IdentityProviderResponse,
  PatchIdentityProviderRequest,
  PutAppFederationSettingsRequest,
} from "@z0/contracts/federation";

import { apiFetch } from "./api";

export async function fetchIdentityProviders(): Promise<{ providers: IdentityProviderResponse[] }> {
  return apiFetch<{ providers: IdentityProviderResponse[] }>("/api/v1/federation/providers");
}

export async function createProviderFromTemplate(
  body: CreateIdentityProviderFromTemplateRequest,
): Promise<IdentityProviderResponse> {
  return apiFetch<IdentityProviderResponse>("/api/v1/federation/providers/from-template", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createCustomProvider(
  body: CreateCustomIdentityProviderRequest,
): Promise<IdentityProviderResponse> {
  return apiFetch<IdentityProviderResponse>("/api/v1/federation/providers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchIdentityProvider(
  providerId: string,
  body: PatchIdentityProviderRequest,
): Promise<IdentityProviderResponse> {
  return apiFetch<IdentityProviderResponse>(`/api/v1/federation/providers/${providerId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteIdentityProvider(providerId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/federation/providers/${providerId}`, { method: "DELETE" });
}

export async function fetchAppFederationSettings(appId: string): Promise<AppFederationSettingsResponse> {
  return apiFetch<AppFederationSettingsResponse>(`/api/v1/apps/${appId}/federation`);
}

export async function putAppFederationSettings(
  appId: string,
  body: PutAppFederationSettingsRequest,
): Promise<AppFederationSettingsResponse> {
  return apiFetch<AppFederationSettingsResponse>(`/api/v1/apps/${appId}/federation`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
