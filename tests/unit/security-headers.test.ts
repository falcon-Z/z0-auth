import { afterEach, describe, expect, test } from "bun:test";

import { applySecurityHeaders } from "../../src/api/lib/security-headers";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe("security headers", () => {
  test("sets browser hardening policy", () => {
    process.env.NODE_ENV = "development";
    const response = applySecurityHeaders(new Response("ok"));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  test("sets HSTS in production", () => {
    process.env.NODE_ENV = "production";
    const response = applySecurityHeaders(new Response("ok"));
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
  });
});
