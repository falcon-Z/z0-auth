import { describe, expect, test } from "bun:test";

import type { SessionResponse } from "@z0/contracts/auth";

import {
  sessionHasPermission,
  tenantPermissionsFromSession,
} from "../../src/app/console/lib/tenant-permissions";

function session(partial: Partial<SessionResponse>): SessionResponse {
  return {
    authenticated: true,
    user: { id: "u1", email: "a@b.c", name: "A" },
    roles: [],
    tenantRoles: [],
    organizations: [],
    canSwitchOrganization: false,
    ...partial,
  };
}

describe("tenant-permissions", () => {
  test("platform_admin role fallback does not grant org users:invite without tenant role", () => {
    const perms = tenantPermissionsFromSession(
      session({
        roles: ["platform_admin"],
        tenantRoles: ["tenant_member"],
      }),
    );
    expect(perms.has("platform:users:read")).toBe(true);
    expect(perms.has("users:invite")).toBe(false);
    expect(perms.has("users:read")).toBe(false);
  });

  test("tenant_admin on active org grants member management permissions", () => {
    const s = session({
      roles: ["platform_admin"],
      tenantRoles: ["tenant_admin"],
    });
    expect(sessionHasPermission(s, "users:invite")).toBe(true);
    expect(sessionHasPermission(s, "users:read")).toBe(true);
  });

  test("prefers session.permissions when present", () => {
    const perms = tenantPermissionsFromSession(
      session({
        roles: ["platform_admin"],
        tenantRoles: ["tenant_admin"],
        permissions: ["tenants:read"],
      }),
    );
    expect(perms.has("users:invite")).toBe(false);
    expect(perms.has("tenants:read")).toBe(true);
  });
});
