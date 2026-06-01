import { describe, expect, test } from "bun:test";

import { maskIpForDisplay, parseClientLabel } from "../../src/api/lib/client-hint";

describe("parseClientLabel", () => {
  test("parses Chrome on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(parseClientLabel(ua)).toBe("Chrome on Windows");
  });

  test("parses Safari on macOS", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(parseClientLabel(ua)).toBe("Safari on macOS");
  });

  test("empty user agent", () => {
    expect(parseClientLabel("")).toBe("Unknown device");
  });
});

describe("maskIpForDisplay", () => {
  test("masks IPv4 last octet", () => {
    expect(maskIpForDisplay("203.0.113.5")).toBe("203.0.113.x");
  });

  test("local returns null", () => {
    expect(maskIpForDisplay("local")).toBeNull();
  });
});
