import { describe, expect, test } from "bun:test";

import { isPlatformPermissionKey } from "../../src/api/lib/permissions";

describe("isPlatformPermissionKey", () => {
  test("treats platform and tenants:create as platform-scoped", () => {
    expect(isPlatformPermissionKey("platform:users:read")).toBe(true);
    expect(isPlatformPermissionKey("platform:tenants:read")).toBe(true);
    expect(isPlatformPermissionKey("tenants:create")).toBe(true);
  });

  test("treats org member permissions as tenant-scoped", () => {
    expect(isPlatformPermissionKey("users:read")).toBe(false);
    expect(isPlatformPermissionKey("users:invite")).toBe(false);
    expect(isPlatformPermissionKey("tenants:read")).toBe(false);
    expect(isPlatformPermissionKey("sessions:revoke")).toBe(false);
  });
});
