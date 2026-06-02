import { describe, expect, test } from "bun:test";

import type { SessionResponse } from "@z0/contracts/auth";
import { dashboardScopeForSession } from "../../src/app/console/modules/dashboard/lib/dashboard-scopes";

function session(partial: Partial<SessionResponse>): SessionResponse {
  return {
    authenticated: true,
    user: { id: "u1", email: "a@example.com", name: "A" },
    ...partial,
  } as SessionResponse;
}

describe("dashboard scope", () => {
  test("tenant member without platform roles sees tenant scope only", () => {
    expect(
      dashboardScopeForSession(session({ tenant: { id: "t1", name: "Acme", slug: "acme" } })),
    ).toBe("tenant");
  });

  test("platform operator without tenant sees platform scope only", () => {
    expect(dashboardScopeForSession(session({ roles: ["platform_admin"] }))).toBe("platform");
  });

  test("dual-role user with active tenant sees tenant scope only", () => {
    expect(
      dashboardScopeForSession(
        session({
          roles: ["platform_admin"],
          tenant: { id: "t1", name: "Acme", slug: "acme" },
        }),
      ),
    ).toBe("tenant");
  });
});
