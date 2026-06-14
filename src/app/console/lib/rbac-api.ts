import type {
  CreateRoleRequest,
  InstanceRoleDetail,
  InstanceRoleSummary,
  PlatformResource,
  SetMemberRolesRequest,
  TransferOwnershipRequest,
} from "@z0/contracts/rbac";

import { apiFetch } from "./http-client";

export async function fetchPlatformResources(): Promise<PlatformResource[]> {
  const { resources } = await apiFetch<{ resources: PlatformResource[] }>("/api/v1/rbac/resources");
  return resources;
}

export async function fetchRoles(): Promise<InstanceRoleSummary[]> {
  const { roles } = await apiFetch<{ roles: InstanceRoleSummary[] }>("/api/v1/rbac/roles");
  return roles;
}

export async function fetchRole(roleId: string): Promise<InstanceRoleDetail> {
  const { role } = await apiFetch<{ role: InstanceRoleDetail }>(`/api/v1/rbac/roles/${roleId}`);
  return role;
}

export async function createRole(body: CreateRoleRequest): Promise<InstanceRoleDetail> {
  const { role } = await apiFetch<{ role: InstanceRoleDetail }>("/api/v1/rbac/roles", {
    method: "POST",
    body,
  });
  return role;
}

export async function patchRole(roleId: string, body: Partial<CreateRoleRequest>): Promise<InstanceRoleDetail> {
  const { role } = await apiFetch<{ role: InstanceRoleDetail }>(`/api/v1/rbac/roles/${roleId}`, {
    method: "PATCH",
    body,
  });
  return role;
}

export async function deleteRole(roleId: string): Promise<void> {
  await apiFetch(`/api/v1/rbac/roles/${roleId}`, { method: "DELETE" });
}

export async function fetchMemberRoles(userId: string): Promise<InstanceRoleSummary[]> {
  const { roles } = await apiFetch<{ userId: string; roles: InstanceRoleSummary[] }>(
    `/api/v1/members/${userId}/roles`,
  );
  return roles;
}

export async function setMemberRoles(userId: string, body: SetMemberRolesRequest): Promise<InstanceRoleSummary[]> {
  const { roles } = await apiFetch<{ userId: string; roles: InstanceRoleSummary[] }>(
    `/api/v1/members/${userId}/roles`,
    { method: "PUT", body },
  );
  return roles;
}

export async function transferOwnership(body: TransferOwnershipRequest): Promise<void> {
  await apiFetch("/api/v1/ownership/transfer", { method: "POST", body });
}
