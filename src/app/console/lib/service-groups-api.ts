import type {
  CreateServiceGroupRequest,
  PatchServiceGroupRequest,
  PutServiceGroupAppsRequest,
  ServiceGroupDetail,
  ServiceGroupSummary,
} from "@z0/contracts/service-groups";

import { apiFetch } from "./api";

export async function fetchServiceGroups(): Promise<{ groups: ServiceGroupSummary[] }> {
  return apiFetch<{ groups: ServiceGroupSummary[] }>("/api/v1/service-groups");
}

export async function fetchServiceGroup(groupId: string): Promise<ServiceGroupDetail> {
  return apiFetch<ServiceGroupDetail>(`/api/v1/service-groups/${groupId}`);
}

export async function createServiceGroup(body: CreateServiceGroupRequest): Promise<ServiceGroupDetail> {
  return apiFetch<ServiceGroupDetail>("/api/v1/service-groups", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchServiceGroup(
  groupId: string,
  body: PatchServiceGroupRequest,
): Promise<ServiceGroupDetail> {
  return apiFetch<ServiceGroupDetail>(`/api/v1/service-groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function putServiceGroupApps(
  groupId: string,
  body: PutServiceGroupAppsRequest,
): Promise<ServiceGroupDetail> {
  return apiFetch<ServiceGroupDetail>(`/api/v1/service-groups/${groupId}/apps`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteServiceGroup(groupId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/service-groups/${groupId}`, { method: "DELETE" });
}
