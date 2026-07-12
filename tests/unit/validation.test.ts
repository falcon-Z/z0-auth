import { describe, expect, test } from "bun:test";

import { ErrorCodes } from "@z0/contracts/errors";
import {
  normalizeEmail,
  parseJsonBody,
  safeDecodeURIComponent,
  validateEmail,
  validateRequiredString,
} from "@z0/contracts/validation";

describe("validation", () => {
  test("validateEmail rejects missing and invalid", () => {
    expect(validateEmail("")[0]?.code).toBe(ErrorCodes.REQUIRED);
    expect(validateEmail("   ")[0]?.code).toBe(ErrorCodes.REQUIRED);
    expect(validateEmail("not-an-email")[0]?.code).toBe(ErrorCodes.INVALID_EMAIL);
    expect(validateEmail("a@b.co")).toEqual([]);
  });

  test("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  Admin@Example.COM ")).toBe("admin@example.com");
  });

  test("validateRequiredString rejects empty", () => {
    const errors = validateRequiredString("  ", "name", "Name");
    expect(errors[0]?.field).toBe("name");
    expect(errors[0]?.code).toBe(ErrorCodes.REQUIRED);
  });

  test("parseJsonBody requires JSON content type", async () => {
    const result = await parseJsonBody(new Request("http://localhost", { method: "POST", body: "{}" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(415);
  });

  test("malformed percent encoding is rejected safely", () => {
    expect(safeDecodeURIComponent("%E0%A4%A")).toBeNull();
  });
});
