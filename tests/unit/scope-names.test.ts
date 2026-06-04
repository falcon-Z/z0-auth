import { describe, expect, test } from "bun:test";

import { normalizeScopeName, validateScopeName } from "../../src/api/lib/scope-names";

describe("scope-names", () => {
  test("normalizeScopeName trims and lowercases", () => {
    expect(normalizeScopeName("  Read:Orders ")).toBe("read:orders");
  });

  test("validateScopeName accepts common patterns", () => {
    expect(validateScopeName("openid")).toEqual([]);
    expect(validateScopeName("read:orders")).toEqual([]);
    expect(validateScopeName("profile.email")).toEqual([]);
  });

  test("validateScopeName rejects empty and invalid", () => {
    expect(validateScopeName("").length).toBeGreaterThan(0);
    expect(validateScopeName("9bad")[0]?.code).toBe("invalid_scope");
    expect(validateScopeName("Has Space")[0]?.code).toBe("invalid_scope");
  });
});
