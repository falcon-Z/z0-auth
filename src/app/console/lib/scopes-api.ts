import type {
  AppScopeSummary,
  CreateAppScopeRequest,
  PatchAppScopeRequest,
} from "@z0/contracts/app-scopes";

import { apiFetch } from "./http-client";

export async function fetchAppScopes(appId: string): Promise<AppScopeSummary[]> {
  const { scopes } = await apiFetch<{ scopes: AppScopeSummary[] }>(
    `/api/v1/apps/${appId}/scopes`,
  );
  return scopes;
}

export async function createAppScope(
  appId: string,
  body: CreateAppScopeRequest,
): Promise<AppScopeSummary> {
  return apiFetch<AppScopeSummary>(`/api/v1/apps/${appId}/scopes`, { method: "POST", body });
}

export async function patchAppScope(
  appId: string,
  scopeId: string,
  body: PatchAppScopeRequest,
): Promise<AppScopeSummary> {
  return apiFetch<AppScopeSummary>(`/api/v1/apps/${appId}/scopes/${scopeId}`, {
    method: "PATCH",
    body,
  });
}

export async function deleteAppScope(appId: string, scopeId: string): Promise<void> {
  await apiFetch(`/api/v1/apps/${appId}/scopes/${scopeId}`, { method: "DELETE" });
}
