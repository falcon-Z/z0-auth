import type {
  CreateInviteRequest,
  CreateInviteResponse,
  InstanceMember,
  PendingInvite,
} from "@z0/contracts/invites";

import { apiFetch } from "./http-client";

export async function fetchInstanceMembers(): Promise<InstanceMember[]> {
  const { members } = await apiFetch<{ members: InstanceMember[] }>("/api/v1/members");
  return members;
}

export async function fetchPendingInvites(): Promise<PendingInvite[]> {
  const { invites } = await apiFetch<{ invites: PendingInvite[] }>("/api/v1/members/invites");
  return invites;
}

export async function createInstanceInvite(body: CreateInviteRequest): Promise<CreateInviteResponse> {
  return apiFetch<CreateInviteResponse>("/api/v1/members/invites", {
    method: "POST",
    body,
  });
}

export async function revokeInstanceInvite(inviteId: string): Promise<void> {
  await apiFetch(`/api/v1/members/invites/${inviteId}`, { method: "DELETE" });
}

export async function removeMember(userId: string): Promise<void> {
  await apiFetch(`/api/v1/members/${userId}`, { method: "DELETE" });
}

export function buildInviteMailto(invite: CreateInviteResponse): string {
  const subject = encodeURIComponent(`Invitation to join: ${invite.invitedName}`);
  const body = encodeURIComponent(
    `You have been invited to join the team.\n\nOpen this link to accept or decline:\n${invite.inviteUrl}\n\nThis link expires on ${new Date(invite.expiresAt).toLocaleString()}.`,
  );
  return `mailto:${encodeURIComponent(invite.email)}?subject=${subject}&body=${body}`;
}
