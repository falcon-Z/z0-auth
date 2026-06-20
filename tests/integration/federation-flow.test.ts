import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { CSRF_COOKIE } from "@z0/contracts/http";
import { APP_SESSION_COOKIE } from "../../src/api/lib/app-session";
import { FEDERATION_STATE_COOKIE } from "../../src/api/lib/federation-broker";
import { closeDatabase } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;

const ownerPassword = makeStrongPassword();
const MOCK_TOKEN_URL = "http://localhost/test-idp/token";
const MOCK_USERINFO_URL = "http://localhost/test-idp/userinfo";
const MOCK_AUTH_URL = "http://localhost/test-idp/authorize";

const originalFetch = globalThis.fetch;

function extractCookieValue(res: Response, key: string): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${key}=`));
  const match = raw?.match(new RegExp(`${key}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function sessionCookieFromResponse(res: Response): string | undefined {
  return extractCookieValue(res, SESSION_COOKIE);
}

async function ownerLogin() {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "owner@example.com", password: ownerPassword },
    }),
  );
  return { csrf, cookie: sessionCookieFromResponse(res)! };
}

run("federation flow", () => {
  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith(MOCK_TOKEN_URL)) {
        return new Response(
          JSON.stringify({
            access_token: "mock-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "openid email profile",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith(MOCK_USERINFO_URL)) {
        return new Response(
          JSON.stringify({
            sub: "mock-subject-1",
            email: "fed@example.com",
            email_verified: true,
            name: "Fed User",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return originalFetch(input, init);
    };

    const csrf = await fetchCsrfToken(dispatchApi);
    await dispatchApi(
      buildRequest("POST", "/api/setup", {
        csrfToken: csrf,
        body: {
          name: "Owner User",
          email: "owner@example.com",
          password: ownerPassword,
          passwordConfirm: ownerPassword,
          organizationName: "Acme Corp",
        },
      }),
    );
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await closeDatabase();
  });

  test("provider CRUD and federated sign-in creates app session", async () => {
    const { csrf, cookie: session } = await ownerLogin();

    const appRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: session },
        body: {
          name: "Fed App",
          redirectUris: ["http://localhost:3000/oauth/callback"],
          clientType: "confidential",
        },
      }),
    );
    expect(appRes.status).toBe(201);
    const created = (await appRes.json()) as {
      app: { id: string };
      credential: { clientId: string };
    };
    const clientId = created.credential.clientId;

    const providerRes = await dispatchApi(
      buildRequest("POST", "/api/v1/federation/providers", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: session },
        body: {
          key: "mock",
          displayName: "Mock IdP",
          authorizationUrl: MOCK_AUTH_URL,
          tokenUrl: MOCK_TOKEN_URL,
          userinfoUrl: MOCK_USERINFO_URL,
          defaultScopes: "openid email profile",
          clientId: "mock-client",
          clientSecret: "mock-secret",
          enabled: true,
        },
      }),
    );
    expect(providerRes.status).toBe(201);
    const provider = (await providerRes.json()) as { id: string };

    const federationPut = await dispatchApi(
      buildRequest("PUT", `/api/v1/apps/${created.app.id}/federation`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: session },
        body: {
          providers: [{ providerId: provider.id, enabled: true, sortOrder: 0 }],
        },
      }),
    );
    expect(federationPut.status).toBe(200);

    const loginPage = await dispatchWeb(
      new Request(`http://localhost/auth/login?client_id=${encodeURIComponent(clientId)}`),
    );
    const html = await loginPage.text();
    expect(html).toContain("Mock IdP");

    const startRes = await dispatchWeb(
      new Request(
        `http://localhost/auth/federation/mock/start?client_id=${encodeURIComponent(clientId)}`,
      ),
    );
    expect(startRes.status).toBe(302);
    const stateCookie = extractCookieValue(startRes, FEDERATION_STATE_COOKIE);
    expect(stateCookie).toBeTruthy();
    const upstream = startRes.headers.get("Location");
    expect(upstream).toContain(MOCK_AUTH_URL);

    const upstreamUrl = new URL(upstream!);
    const upstreamState = upstreamUrl.searchParams.get("state")!;

    const callbackRes = await dispatchWeb(
      new Request(
        `http://localhost/auth/federation/mock/callback?code=mock-code&state=${encodeURIComponent(upstreamState)}`,
        {
          headers: {
            Cookie: `${FEDERATION_STATE_COOKIE}=${encodeURIComponent(stateCookie!)}`,
          },
        },
      ),
    );
    expect(callbackRes.status).toBe(302);
    const appSession = extractCookieValue(callbackRes, APP_SESSION_COOKIE);
    expect(appSession).toBeTruthy();
  });
});
