import { describe, expect, test } from "bun:test";

import { createOperatorAccess } from "../../src/capabilities/operator-access";

describe("Operator Access capability", () => {
  test("an Operator can perform only tasks covered by held scopes", async () => {
    const capability = createOperatorAccess({
      getOperatorScopeKeys: async () => ["applications:read"],
    });

    expect(await capability.authorizeOperatorTask({
      operatorId: "operator-a",
      requiredScope: "applications:read",
    })).toEqual({ allowed: true });
    expect(await capability.authorizeOperatorTask({
      operatorId: "operator-a",
      requiredScope: "applications:write",
    })).toEqual({ allowed: false, reason: "permission_denied" });
  });

  test("an Operator cannot grant scopes they do not hold", async () => {
    const capability = createOperatorAccess({
      getOperatorScopeKeys: async () => ["applications:read", "applications:write"],
    });

    expect(await capability.authorizeScopeGrant({
      operatorId: "operator-a",
      requestedScopes: ["applications:read", "members:invite", "members:invite"],
    })).toEqual({
      allowed: false,
      reason: "grant_exceeds_authority",
      missingScopes: ["members:invite"],
    });
  });
});
