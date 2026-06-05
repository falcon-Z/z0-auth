import { describe, expect, test } from "bun:test";

import { safeReturnPath } from "../../src/web/safe-return-path";

describe("safeReturnPath", () => {
  test("allows relative paths", () => {
    expect(safeReturnPath("/oauth/resume", "/")).toBe("/oauth/resume");
    expect(safeReturnPath("/auth/login?client_id=z0_abc", "/")).toBe("/auth/login?client_id=z0_abc");
  });

  test("rejects external and protocol-relative URLs", () => {
    expect(safeReturnPath("https://evil.test", "/")).toBe("/");
    expect(safeReturnPath("//evil.test/path", "/")).toBe("/");
    expect(safeReturnPath("%2F%2Fevil.test", "/")).toBe("/");
  });

  test("rejects control characters", () => {
    expect(safeReturnPath("/oauth/resume%0d%0aSet-Cookie: x=y", "/")).toBe("/");
  });
});
