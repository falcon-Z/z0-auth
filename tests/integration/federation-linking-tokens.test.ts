import { afterAll, beforeAll, describe, expect, test } from "bun:test";

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

function installMockIdp(fetchImpl: typeof globalThis.fetch) {
  globalThis.fetch = fetchImpl;
}

run("federation linking and tokens", () => {
  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();

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

  async function createAppWithProvider(suffix: string) {
    const { csrf, cookie: session } = await ownerLogin();
    const appRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: session },
        body: {
          name: `Fed App ${suffix}`,
          redirectUris: ["http://localhost:3000/oauth/callback"],
          clientType: "confidential",
        },
      }),
    );
    expect(appRes.status).toBe(201);
    const created = (await appRes.json()) as {
      app: { id: string };
      credential: { clientId: string };
      clientSecret: string;
    };

    const providerRes = await dispatchApi(
      buildRequest("POST", "/api/v1/federation/providers", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: session },
        body: {
          key: `mock-${suffix}`,
          displayName: `Mock IdP ${suffix}`,
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
    expect(provider.id).toMatch(/^[0-9a-f-]{36}$/i);

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

    return {
      csrf,
      session,
      appId: created.app.id,
      clientId: created.credential.clientId,
      clientSecret: created.clientSecret,
      providerId: provider.id,
      providerKey: `mock-${suffix}`,
    };
  }

  async function federatedSignIn(
    clientId: string,
    providerKey: string,
    subject: string,
    email: string,
    options?: { includeRefresh?: boolean },
  ) {
    installMockIdp(async (input, init) => {
      const url = String(input);
      if (url.startsWith(MOCK_TOKEN_URL)) {
        const body = init?.body ? String(init.body) : "";
        if (body.includes("grant_type=refresh_token")) {
          return new Response(
            JSON.stringify({
              access_token: "mock-refreshed-token",
              refresh_token: "mock-refresh-token-2",
              token_type: "Bearer",
              expires_in: 3600,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            access_token: "mock-access-token",
            refresh_token: options?.includeRefresh === false ? undefined : "mock-refresh-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "openid email profile",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith(MOCK_USERINFO_URL)) {
        return new Response(
          JSON.stringify({ sub: subject, email, email_verified: true, name: "Fed User" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return originalFetch(input, init);
    });

    const startRes = await dispatchWeb(
      new Request(
        `http://localhost/auth/federation/${encodeURIComponent(providerKey)}/start?client_id=${encodeURIComponent(clientId)}`,
      ),
    );
    const stateCookie = extractCookieValue(startRes, FEDERATION_STATE_COOKIE)!;
    const upstreamState = new URL(startRes.headers.get("Location")!).searchParams.get("state")!;

    const callbackRes = await dispatchWeb(
      new Request(
        `http://localhost/auth/federation/${encodeURIComponent(providerKey)}/callback?code=mock-code&state=${encodeURIComponent(upstreamState)}`,
        { headers: { Cookie: `${FEDERATION_STATE_COOKIE}=${encodeURIComponent(stateCookie)}` } },
      ),
    );
    expect(callbackRes.status).toBe(302);
    return extractCookieValue(callbackRes, APP_SESSION_COOKIE)!;
  }

  test("builtin GitHub template can be created", async () => {
    const { csrf, cookie: session } = await ownerLogin();
    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/federation/providers/from-template", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: session },
        body: {
          builtinId: "github",
          clientId: "gh-client",
          clientSecret: "gh-secret",
          enabled: true,
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string; builtinId: string };
    expect(body.key).toBe("github");
    expect(body.builtinId).toBe("github");
  });

  test("federated sign-in links to existing password account", async () => {
    const { csrf, session, appId, clientId, providerId, providerKey } = await createAppWithProvider("link");
    const linkPassword = makeStrongPassword();
    const createUserRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: session },
        body: {
          email: "link@example.com",
          name: "Link User",
          password: linkPassword,
          passwordConfirm: linkPassword,
        },
      }),
    );
    expect(createUserRes.status).toBe(201);

    const appSession = await federatedSignIn(clientId, providerKey, "mock-subject-link", "link@example.com");
    expect(appSession).toBeTruthy();

    const usersRes = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/users`, {
        cookies: { [SESSION_COOKIE]: session },
      }),
    );
    const users = (await usersRes.json()) as { users: { userId: string; email: string }[] };
    expect(users.users.filter((user) => user.email === "link@example.com")).toHaveLength(1);

    const userId = users.users.find((user) => user.email === "link@example.com")!.userId;
    const tokenRes = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/users/${userId}/federation/${providerId}/token`, {
        cookies: { [SESSION_COOKIE]: session },
      }),
    );
    expect(tokenRes.status).toBe(200);
  });

  test("console can read and refresh upstream provider token", async () => {
    const { csrf, session, appId, clientId, providerId, providerKey } = await createAppWithProvider("token");
    expect(providerId).toMatch(/^[0-9a-f-]{36}$/i);
    await federatedSignIn(clientId, providerKey, "mock-subject-token", "token@example.com");

    const usersRes = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/users`, {
        cookies: { [SESSION_COOKIE]: session },
      }),
    );
    const userId = ((await usersRes.json()) as { users: { userId: string; email: string }[] }).users.find(
      (user) => user.email === "token@example.com",
    )!.userId;

    const tokenRes = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/users/${userId}/federation/${providerId}/token`, {
        cookies: { [SESSION_COOKIE]: session },
      }),
    );
    expect(tokenRes.status).toBe(200);
    const tokenBody = (await tokenRes.json()) as { accessToken: string; refreshed: boolean };
    expect(tokenBody.accessToken).toBe("mock-access-token");
    expect(tokenBody.refreshed).toBe(false);

    const refreshRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/users/${userId}/federation/${providerId}/token/refresh`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: session },
      }),
    );
    expect(refreshRes.status).toBe(200);
    const refreshed = (await refreshRes.json()) as { accessToken: string; refreshed: boolean };
    expect(refreshed.accessToken).toBe("mock-refreshed-token");
    expect(refreshed.refreshed).toBe(true);
  });

  test("machine token with federation:token scope can refresh upstream token", async () => {
    const { appId, clientId, clientSecret, providerId, providerKey } = await createAppWithProvider("m2m");
    await federatedSignIn(clientId, providerKey, "mock-subject-m2m", "m2m@example.com");

    const { csrf, cookie: session } = await ownerLogin();
    const usersRes = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/users`, {
        cookies: { [SESSION_COOKIE]: session },
      }),
    );
    const userId = ((await usersRes.json()) as { users: { userId: string; email: string }[] }).users.find(
      (user) => user.email === "m2m@example.com",
    )!.userId;

    const machineTokenRes = await dispatchWeb(
      new Request("http://localhost/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "federation:token",
        }).toString(),
      }),
    );
    expect(machineTokenRes.status).toBe(200);
    const machineToken = ((await machineTokenRes.json()) as { access_token: string }).access_token;

    const refreshRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/users/${userId}/federation/${providerId}/token/refresh`, {
        headers: { Authorization: `Bearer ${machineToken}` },
      }),
    );
    expect(refreshRes.status).toBe(200);
    const refreshed = (await refreshRes.json()) as { accessToken: string };
    expect(refreshed.accessToken).toBe("mock-refreshed-token");
  });
});
