import { describe, expect, test } from "bun:test";

import type { SessionResponse } from "@z0/contracts/auth";
import {
  hasPlatformConsoleAccess,
  isTenantOnlyConsoleUser,
  shouldHideTenantsNav,
  tenantMembershipCount,
} from "../../src/app/console/lib/console-access";

function session(partial: Partial<SessionResponse>): SessionResponse {
  return {
    authenticated: true,
    user: { id: "u1", email: "a@b.c", name: "A" },
    roles: [],
    tenantRoles: [],
    organizations: [],
    canSwitchOrganization: false,
    permissions: [],
    ...partial,
  };
}

describe("console-access", () => {
  test("platform roles unlock platform console", () => {
    expect(hasPlatformConsoleAccess(session({ roles: ["platform_admin"] }))).toBe(true);
    expect(isTenantOnlyConsoleUser(session({ roles: ["platform_admin"] }))).toBe(false);
  });

  test("tenant-only member has no platform console", () => {
    const s = session({
      roles: [],
      tenant: { id: "t1", name: "Acme", slug: "acme" },
      tenantRoles: ["tenant_member"],
      organizations: [{ id: "t1", name: "Acme", slug: "acme" }],
    });
    expect(hasPlatformConsoleAccess(s)).toBe(false);
    expect(isTenantOnlyConsoleUser(s)).toBe(true);
  });

  test("hide tenants nav for single-tenant members only", () => {
    const single = session({
      organizations: [{ id: "t1", name: "Acme", slug: "acme" }],
      tenant: { id: "t1", name: "Acme", slug: "acme" },
    });
    const multi = session({
      organizations: [
        { id: "t1", name: "Acme", slug: "acme" },
        { id: "t2", name: "Beta", slug: "beta" },
      ],
    });
    expect(shouldHideTenantsNav(single)).toBe(true);
    expect(shouldHideTenantsNav(multi)).toBe(false);
    expect(shouldHideTenantsNav(session({ roles: ["platform_admin"], organizations: single.organizations }))).toBe(
      false,
    );
  });

  test("tenantMembershipCount uses organizations list", () => {
    expect(tenantMembershipCount(session({ organizations: [{ id: "1", name: "A", slug: "a" }] }))).toBe(1);
    expect(tenantMembershipCount(session({ tenant: { id: "1", name: "A", slug: "a" } }))).toBe(1);
  });
});
