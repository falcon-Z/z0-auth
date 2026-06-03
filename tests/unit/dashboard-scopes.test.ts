import { describe, expect, test } from "bun:test";

import type { SessionResponse } from "@z0/contracts/auth";
import { dashboardScopeForSession } from "../../src/app/console/modules/dashboard/lib/dashboard-scopes";

describe("dashboard-scopes", () => {
  test("instance member gets instance scope", () => {
    const scope = dashboardScopeForSession({
      authenticated: true,
      isInstanceMember: true,
      user: { id: "1", email: "a@b.com", name: "A" },
    });
    expect(scope).toBe("instance");
  });

  test("non-member gets null scope", () => {
    expect(
      dashboardScopeForSession({
        authenticated: true,
        isInstanceMember: false,
        user: { id: "1", email: "a@b.com", name: "A" },
      }),
    ).toBeNull();
  });
});
