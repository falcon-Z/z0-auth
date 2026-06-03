import { describe, expect, test } from "bun:test";

import type { SessionResponse } from "@z0/contracts/auth";
import { hasConsoleAccess } from "../../src/app/console/lib/console-access";

function session(partial: Partial<SessionResponse>): SessionResponse {
  return {
    authenticated: true,
    user: { id: "u1", email: "a@b.com", name: "A" },
    ...partial,
  };
}

describe("console-access", () => {
  test("instance member has console access", () => {
    expect(hasConsoleAccess(session({ isInstanceMember: true }))).toBe(true);
  });

  test("signed-in non-member has no console access", () => {
    expect(hasConsoleAccess(session({ isInstanceMember: false }))).toBe(false);
  });

  test("unauthenticated has no console access", () => {
    expect(hasConsoleAccess({ authenticated: false })).toBe(false);
  });
});
