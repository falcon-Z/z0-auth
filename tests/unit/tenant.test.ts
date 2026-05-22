import { describe, expect, test } from "bun:test";

import { slugifyOrganization } from "../../packages/server/src/api/lib/tenant";

describe("slugifyOrganization", () => {
  test("lowercases and hyphenates", () => {
    expect(slugifyOrganization("Acme IAM")).toBe("acme-iam");
  });

  test("strips leading and trailing punctuation", () => {
    expect(slugifyOrganization("  My Org!!! ")).toBe("my-org");
  });

  test("falls back when empty after sanitization", () => {
    expect(slugifyOrganization("   ")).toBe("organization");
  });
});
