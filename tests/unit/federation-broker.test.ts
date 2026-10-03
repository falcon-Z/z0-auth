import { describe, expect, test } from "bun:test";

import { parseUpstreamTokenResponse } from "../../src/api/lib/federation-broker";

describe("upstream token responses", () => {
  test("accepts JSON tokens and normalizes form-encoded expiry", () => {
    expect(parseUpstreamTokenResponse({ access_token: "token", expires_in: 3600 })).toEqual({
      access_token: "token", expires_in: 3600,
    });
    expect(parseUpstreamTokenResponse({ access_token: "token", expires_in: "3600", refresh_token: "refresh" })).toEqual({
      access_token: "token", expires_in: 3600, refresh_token: "refresh",
    });
    expect(parseUpstreamTokenResponse({ access_token: "token", expires_in: 0 }).expires_in).toBe(0);
    expect(parseUpstreamTokenResponse({ access_token: "token" })).toEqual({ access_token: "token" });
  });

  test("rejects malformed tokens and optional fields", () => {
    for (const payload of [null, [], "token", {}, { access_token: "" }, { access_token: 123 }]) {
      expect(() => parseUpstreamTokenResponse(payload)).toThrow();
    }
    for (const field of ["refresh_token", "token_type", "scope", "id_token"]) {
      expect(() => parseUpstreamTokenResponse({ access_token: "token", [field]: 123 })).toThrow();
    }
  });

  test("rejects invalid or imprecise lifetimes", () => {
    for (const expires_in of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "-1", "1.5", "", "soon", null]) {
      expect(() => parseUpstreamTokenResponse({ access_token: "token", expires_in })).toThrow();
    }
  });
});
