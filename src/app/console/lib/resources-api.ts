import type {
  ResourceSummary,
  CreateResourceRequest,
  PatchResourceRequest,
  ClientResourcePermission,
} from "@z0/contracts/resources";
import { apiFetch } from "./http-client";
export async function fetchResources(appId?: string) {
  return (
    await apiFetch<{ resources: ResourceSummary[] }>(
      appId ? `/api/v1/apps/${appId}/resources` : "/api/v1/resources",
    )
  ).resources;
}
export function createResource(appId: string, body: CreateResourceRequest) {
  return apiFetch<ResourceSummary>(`/api/v1/apps/${appId}/resources`, {
    method: "POST",
    body,
  });
}
export function patchResource(
  appId: string,
  id: string,
  body: PatchResourceRequest,
) {
  return apiFetch<ResourceSummary>(`/api/v1/apps/${appId}/resources/${id}`, {
    method: "PATCH",
    body,
  });
}
export function retireResource(appId: string, id: string) {
  return apiFetch<ResourceSummary>(`/api/v1/apps/${appId}/resources/${id}`, {
    method: "DELETE",
  });
}
export async function fetchClientResources(appId: string, clientId: string) {
  return (
    await apiFetch<{ permissions: ClientResourcePermission[] }>(
      `/api/v1/apps/${appId}/clients/${clientId}/resources`,
    )
  ).permissions;
}
export function putClientResource(
  appId: string,
  clientId: string,
  resourceId: string,
  scopes: string[],
) {
  return apiFetch(
    `/api/v1/apps/${appId}/clients/${clientId}/resources/${resourceId}`,
    { method: "PUT", body: { scopes } },
  );
}
export function removeClientResource(
  appId: string,
  clientId: string,
  resourceId: string,
) {
  return apiFetch(
    `/api/v1/apps/${appId}/clients/${clientId}/resources/${resourceId}`,
    { method: "DELETE" },
  );
}
