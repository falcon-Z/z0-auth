import type { SessionResponse } from "@z0/contracts/auth";

export function isSessionMemberOfTenant(session: SessionResponse, tenantId: string): boolean {
  return (session.organizations ?? []).some((org) => org.id === tenantId);
}
