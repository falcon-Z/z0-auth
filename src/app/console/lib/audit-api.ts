import type { ListAuditEventsResponse } from "@z0/contracts/audit";

import { apiFetch } from "./http-client";

export type AuditListParams = {
  limit?: number;
  before?: string;
  action?: string;
  resourceType?: string;
};

export async function fetchAuditEvents(params: AuditListParams = {}): Promise<ListAuditEventsResponse> {
  const search = new URLSearchParams();
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.before) search.set("before", params.before);
  if (params.action) search.set("action", params.action);
  if (params.resourceType) search.set("resourceType", params.resourceType);

  const query = search.toString();
  return apiFetch<ListAuditEventsResponse>(`/api/v1/audit-events${query ? `?${query}` : ""}`);
}

const ACTION_LABELS: Record<string, string> = {
  "auth.login_succeeded": "Console sign-in",
  "auth.login_failed": "Failed console sign-in",
  "auth.app_login_succeeded": "App sign-in",
  "auth.app_login_failed": "Failed app sign-in",
  "auth.app_register_succeeded": "App registration",
  "auth.app_federation_login_succeeded": "App federated sign-in",
  "app.created": "App created",
  "app.updated": "App updated",
  "credential.created": "Credential created",
  "credential.revoked": "Credential revoked",
  "credential.rotated": "Credential rotated",
  "scope.created": "Scope created",
  "scope.updated": "Scope updated",
  "scope.deleted": "Scope deleted",
  "session.revoked": "Session revoked",
  "session.revoked_current": "Signed out",
  "session.revoked_others": "Other sessions signed out",
  "app_user_session.revoked": "App user session revoked",
  "member.removed": "Member removed",
  "member.roles_updated": "Member roles updated",
  "invite.created": "Invite sent",
  "invite.accepted": "Invite accepted",
  "invite.declined": "Invite declined",
  "invite.revoked": "Invite revoked",
  "ownership.transferred": "Ownership transferred",
  "role.created": "Role created",
  "role.updated": "Role updated",
  "role.deleted": "Role deleted",
  "smtp.settings_updated": "Email settings updated",
  "smtp.test_sent": "Test email sent",
  "auth_settings.instance_updated": "Sign-in settings updated",
  "auth_settings.app_updated": "App sign-in settings updated",
  "federation.provider_created": "Sign-in provider added",
  "federation.provider_updated": "Sign-in provider updated",
  "federation.provider_deleted": "Sign-in provider removed",
  "federation.app_updated": "App federation updated",
  "service_group.created": "App group created",
  "service_group.updated": "App group updated",
  "service_group.apps_updated": "App group apps updated",
  "service_group.deleted": "App group deleted",
  "app_user.created": "App user created",
  "app_user.updated": "App user updated",
  "app_user.disabled": "App user disabled",
  "app_user_invite.created": "App user invite sent",
  "app_user_invite.accepted": "App user invite accepted",
  "app_user_invite.declined": "App user invite declined",
  "app_user_invite.revoked": "App user invite revoked",
  "user.password_changed": "Password changed",
  "password_reset.requested": "Password reset requested",
  "password_reset.completed": "Password reset completed",
  "magic_link.requested": "Magic link requested",
  "magic_link.used": "Magic link used",
};

export function formatAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replaceAll(".", " · ");
}

export function formatAuditActor(name: string | null, email: string | null): string {
  if (name && email) return `${name} (${email})`;
  if (email) return email;
  if (name) return name;
  return "System";
}
