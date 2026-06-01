import { describe, expect, test } from "bun:test";

import {
  assignableTenantRoles,
  canAssignTenantRoles,
  TENANT_ROLE_KEYS,
} from "../../src/lib/rbac/tenant-roles";

describe("tenant role assignment", () => {
  test("admin can assign all tenant roles", () => {
    expect([...assignableTenantRoles(["tenant_admin"])].sort()).toEqual(
      [...TENANT_ROLE_KEYS].sort(),
    );
  });

  test("manager cannot assign admin", () => {
    expect([...assignableTenantRoles(["tenant_manager"])].sort()).toEqual(
      ["tenant_member", "tenant_manager"].sort(),
    );
    expect(canAssignTenantRoles(["tenant_manager"], ["tenant_admin"])).toBe(false);
    expect(canAssignTenantRoles(["tenant_manager"], ["tenant_member"])).toBe(true);
  });

  test("platform write break-glass can assign all when not a member", () => {
    expect(canAssignTenantRoles([], ["tenant_admin"], { platformUserWrite: true })).toBe(true);
    expect(canAssignTenantRoles([], ["tenant_member"], { platformUserWrite: false })).toBe(false);
  });
});
