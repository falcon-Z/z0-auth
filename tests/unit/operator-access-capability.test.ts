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

  test("sensitive tasks require the declared fresh Assurance Level", async () => {
    const capability = createOperatorAccess({
      getOperatorScopeKeys: async () => [],
    });
    const now = new Date("2026-09-17T12:00:00.000Z");

    expect(capability.authorizeSensitiveTask({
      assuranceLevel: "primary",
      authenticatedAt: new Date("2026-09-17T11:59:00.000Z"),
      requiredAssuranceLevel: "multi_factor",
      maximumAgeMs: 10 * 60 * 1000,
      now,
    })).toEqual({ allowed: false, reason: "insufficient_assurance" });

    expect(capability.authorizeSensitiveTask({
      assuranceLevel: "primary",
      authenticatedAt: new Date("2026-09-17T11:59:00.000Z"),
      requiredAssuranceLevel: "primary",
      maximumAgeMs: 10 * 60 * 1000,
      now,
    })).toEqual({ allowed: true });

    expect(capability.authorizeSensitiveTask({
      assuranceLevel: "primary",
      authenticatedAt: new Date("2026-09-17T11:49:59.999Z"),
      requiredAssuranceLevel: "primary",
      maximumAgeMs: 10 * 60 * 1000,
      now,
    })).toEqual({ allowed: false, reason: "stale_authentication" });

    expect(capability.authorizeSensitiveTask({
      assuranceLevel: "multi_factor",
      authenticatedAt: new Date("2026-09-17T11:49:59.999Z"),
      requiredAssuranceLevel: "multi_factor",
      maximumAgeMs: 10 * 60 * 1000,
      now,
    })).toEqual({ allowed: false, reason: "stale_authentication" });

    expect(capability.authorizeSensitiveTask({
      assuranceLevel: "multi_factor",
      authenticatedAt: new Date("2026-09-17T11:59:00.000Z"),
      requiredAssuranceLevel: "phishing_resistant",
      maximumAgeMs: 10 * 60 * 1000,
      now,
    })).toEqual({ allowed: false, reason: "insufficient_assurance" });

    expect(capability.authorizeSensitiveTask({
      assuranceLevel: "phishing_resistant",
      authenticatedAt: new Date("2026-09-17T11:59:00.000Z"),
      requiredAssuranceLevel: "multi_factor",
      maximumAgeMs: 10 * 60 * 1000,
      now,
    })).toEqual({ allowed: true });
  });
});
