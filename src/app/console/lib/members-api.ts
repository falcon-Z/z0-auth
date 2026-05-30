import type {
  CreateInviteRequest,
  CreateInviteResponse,
  PendingInvite,
  RoleSummary,
  TenantMember,
} from "@z0/contracts/invites";

import { apiFetch } from "./http-client";

export async function fetchTenantRoles(): Promise<RoleSummary[]> {
  return apiFetch<RoleSummary[]>("/api/v1/roles?scope=tenant");
}

export async function fetchTenantMembers(tenantId: string): Promise<TenantMember[]> {
  const { members } = await apiFetch<{ members: TenantMember[] }>(`/api/v1/tenants/${tenantId}/members`);
  return members;
}

export async function fetchPendingInvites(tenantId: string): Promise<PendingInvite[]> {
  const { invites } = await apiFetch<{ invites: PendingInvite[] }>(`/api/v1/tenants/${tenantId}/invites`);
  return invites;
}

export async function createTenantInvite(
  tenantId: string,
  body: CreateInviteRequest,
): Promise<CreateInviteResponse> {
  return apiFetch<CreateInviteResponse>(`/api/v1/tenants/${tenantId}/invites`, {
    method: "POST",
    body,
  });
}

export async function revokeTenantInvite(tenantId: string, inviteId: string): Promise<void> {
  await apiFetch(`/api/v1/tenants/${tenantId}/invites/${inviteId}`, { method: "DELETE" });
}

export async function updateMemberRoles(
  tenantId: string,
  userId: string,
  roleKeys: string[],
): Promise<void> {
  await apiFetch(`/api/v1/tenants/${tenantId}/members/${userId}/roles`, {
    method: "PATCH",
    body: { roleKeys },
  });
}

export async function removeMember(tenantId: string, userId: string): Promise<void> {
  await apiFetch(`/api/v1/tenants/${tenantId}/members/${userId}`, { method: "DELETE" });
}

export function buildInviteMailto(invite: CreateInviteResponse): string {
  const subject = encodeURIComponent(`Invitation to join — ${invite.invitedName}`);
  const body = encodeURIComponent(
    `You have been invited to join our organization.\n\nOpen this link to accept or decline:\n${invite.inviteUrl}\n\nThis link expires on ${new Date(invite.expiresAt).toLocaleString()}.`,
  );
  return `mailto:${encodeURIComponent(invite.email)}?subject=${subject}&body=${body}`;
}
