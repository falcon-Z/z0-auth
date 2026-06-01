import type { SessionResponse } from "@z0/contracts/auth";

import { sessionHasPermission } from "./tenant-permissions";

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

/**
 * Cross-tenant directory (sidebar /tenants). Not the same as `tenants:read` on the active org.
 * Plain tenant members use the switcher only; platform operators and org creators use the list.
 */
export function shouldShowTenantsNav(session: SessionResponse): boolean {
  if (!session.authenticated) return false;
  if (sessionHasPermission(session, "platform:tenants:read")) return true;
  if (sessionHasPermission(session, "tenants:create")) return true;
  return false;
}

/** @deprecated Prefer shouldShowTenantsNav; kept for call sites that gate on hide. */
export function shouldHideTenantsNav(session: SessionResponse): boolean {
  return !shouldShowTenantsNav(session);
}
