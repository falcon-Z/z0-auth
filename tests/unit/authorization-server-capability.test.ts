import { describe, expect, test } from "bun:test";

import { createAuthorizationServer } from "../../src/capabilities/authorization-server";

describe("Authorization Server capability", () => {
  test("an authorization request uses an exact registered redirect URI", () => {
    const capability = createAuthorizationServer();
    const registeredRedirectUris = ["https://app.example.com/oauth/callback"];

    expect(capability.authorizeRedirect({
      registeredRedirectUris,
      requestedRedirectUri: "https://app.example.com/oauth/callback",
    })).toEqual({ allowed: true });
    expect(capability.authorizeRedirect({
      registeredRedirectUris,
      requestedRedirectUri: "https://app.example.com/oauth/callback/",
    })).toEqual({ allowed: false, reason: "redirect_uri_not_registered" });
    expect(capability.authorizeRedirect({
      registeredRedirectUris,
      requestedRedirectUri: "https://app.example.com/oauth/callback?next=/admin",
    })).toEqual({ allowed: false, reason: "redirect_uri_not_registered" });
  });
});
