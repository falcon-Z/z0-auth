import type { SessionResponse } from "@z0/contracts/auth";

/** User has at least one platform-scoped role (instance operator). */
export function hasPlatformConsoleAccess(session: SessionResponse): boolean {
  return (session.roles?.length ?? 0) > 0;
}

/** Member of one or more tenants with no platform roles. */
export function isTenantOnlyConsoleUser(session: SessionResponse): boolean {
  if (!session.authenticated) return false;
  return !hasPlatformConsoleAccess(session);
}

export function tenantMembershipCount(session: SessionResponse): number {
  if (session.organizations?.length) return session.organizations.length;
  return session.tenant ? 1 : 0;
}

/** Single-tenant members do not need a tenants list in the sidebar. */
export function shouldHideTenantsNav(session: SessionResponse): boolean {
  return isTenantOnlyConsoleUser(session) && tenantMembershipCount(session) <= 1;
}
