import { afterEach, describe, expect, test } from "bun:test";

import { requestPublicOrigin } from "../../src/api/lib/config";

const originalNodeEnv = process.env.NODE_ENV;
const originalPublicOrigin = process.env.PUBLIC_ORIGIN;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalPublicOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = originalPublicOrigin;
});

describe("public origin", () => {
  test("development falls back to the request origin", () => {
    process.env.NODE_ENV = "development";
    delete process.env.PUBLIC_ORIGIN;
    expect(requestPublicOrigin(new Request("http://localhost:3000/path"))).toBe("http://localhost:3000");
  });

  test("production requires one configured HTTPS origin", () => {
    process.env.NODE_ENV = "production";
    delete process.env.PUBLIC_ORIGIN;
    expect(() => requestPublicOrigin(new Request("https://attacker.example/path"))).toThrow(
      "PUBLIC_ORIGIN is required",
    );

    process.env.PUBLIC_ORIGIN = "http://auth.example.com";
    expect(() => requestPublicOrigin(new Request("https://attacker.example/path"))).toThrow("must use https");

    process.env.PUBLIC_ORIGIN = "https://auth.example.com";
    expect(requestPublicOrigin(new Request("https://attacker.example/path"))).toBe("https://auth.example.com");
  });
});
