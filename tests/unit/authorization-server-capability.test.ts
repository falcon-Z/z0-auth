import { describe, expect, test } from "bun:test";

import { createAuthorizationServer } from "../../src/capabilities/authorization-server";

describe("Authorization Server capability", () => {
  test("an authorization request uses an exact registered redirect URI", () => {
    const capability = createAuthorizationServer({
      consentChallenges: {
        create: async () => {},
        findContext: async () => null,
        complete: async () => ({ outcome: "missing" }),
      },
    });
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

  test("beginning consent creates a purpose-bound, subject-bound expiring challenge", async () => {
    let persisted: Record<string, unknown> | undefined;
    const capability = createAuthorizationServer({
      consentChallenges: {
        create: async (challenge) => { persisted = challenge; },
        findContext: async () => null,
        complete: async () => ({ outcome: "missing" }),
      },
      generateNonce: () => "known-consent-nonce",
    });

    const challenge = await capability.beginConsent({
      responseType: "code",
      appId: "app-1",
      appUserId: "end-user-1",
      clientId: "client-1",
      redirectUri: "https://application.example/callback",
      scope: "openid profile",
      resource: "urn:unit:api",
      state: "request-state",
      codeChallenge: "pkce-challenge",
      codeChallengeMethod: "S256",
      oidcNonce: "oidc-nonce",
    });

    expect(challenge).toEqual({ nonce: "known-consent-nonce" });
    expect(persisted).toEqual({
      nonce: "known-consent-nonce",
      purpose: "oauth_consent",
      lifetimeSeconds: 600,
      responseType: "code",
      appId: "app-1",
      appUserId: "end-user-1",
      clientId: "client-1",
      redirectUri: "https://application.example/callback",
      scope: "openid profile",
      resource: "urn:unit:api",
      state: "request-state",
      codeChallenge: "pkce-challenge",
      codeChallengeMethod: "S256",
      oidcNonce: "oidc-nonce",
    });
  });
});
