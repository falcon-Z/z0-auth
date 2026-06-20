import { afterAll, beforeAll, describe, expect, test } from "bun:test";

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
const REDIRECT = "http://localhost:3000/oauth/callback";
const SPA_ORIGIN = "http://localhost:3000";

function sessionCookieFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

async function completeSetup() {
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

run("OAuth client credentials grant", () => {
  let confidentialClientId = "";
  let confidentialSecret = "";
  let publicClientId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
    const { csrf, cookie } = await ownerLogin();

    const confidentialRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "M2M App", redirectUris: [REDIRECT], clientType: "confidential" },
      }),
    );
    const confidential = (await confidentialRes.json()) as {
      credential: { clientId: string };
      clientSecret: string;
      app: { id: string };
    };
    confidentialClientId = confidential.credential.clientId;
    confidentialSecret = confidential.clientSecret;

    await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${confidential.app.id}/scopes`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "read:orders", description: "Read orders" },
      }),
    );

    const publicRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "Public M2M", redirectUris: [REDIRECT], clientType: "public" },
      }),
    );
    publicClientId = ((await publicRes.json()) as { credential: { clientId: string } }).credential.clientId;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("confidential client obtains machine access token", async () => {
    const res = await dispatchWeb(
      new Request("http://localhost/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: confidentialClientId,
          client_secret: confidentialSecret,
          scope: "read:orders",
        }).toString(),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string; scope: string; refresh_token?: string };
    expect(body.access_token.startsWith("z0_at_")).toBe(true);
    expect(body.scope).toBe("read:orders");
    expect(body.refresh_token).toBeUndefined();
  });

  test("public client is rejected for client_credentials", async () => {
    const res = await dispatchWeb(
      new Request("http://localhost/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: publicClientId,
        }).toString(),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthorized_client");
  });

  test("machine token cannot call userinfo", async () => {
    const tokenRes = await dispatchWeb(
      new Request("http://localhost/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: confidentialClientId,
          client_secret: confidentialSecret,
          scope: "read:orders",
        }).toString(),
      }),
    );
    const token = (await tokenRes.json()) as { access_token: string };

    const userinfoRes = await dispatchWeb(
      new Request("http://localhost/oauth/userinfo", {
        headers: { authorization: `Bearer ${token.access_token}` },
      }),
    );
    expect(userinfoRes.status).toBe(401);
  });

  test("invalid scope is rejected", async () => {
    const res = await dispatchWeb(
      new Request("http://localhost/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: confidentialClientId,
          client_secret: confidentialSecret,
          scope: "unknown:scope",
        }).toString(),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_scope");
  });
});

run("OAuth CORS", () => {
  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
    const { csrf, cookie } = await ownerLogin();
    await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "CORS App", redirectUris: [REDIRECT], clientType: "confidential" },
      }),
    );
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("OPTIONS preflight allows registered redirect origin", async () => {
    const res = await dispatchWeb(
      new Request("http://localhost/oauth/token", {
        method: "OPTIONS",
        headers: {
          Origin: SPA_ORIGIN,
          "Access-Control-Request-Method": "POST",
        },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SPA_ORIGIN);
  });

  test("OPTIONS preflight blocks unknown origin", async () => {
    const res = await dispatchWeb(
      new Request("http://localhost/oauth/token", {
        method: "OPTIONS",
        headers: {
          Origin: "http://evil.example",
          "Access-Control-Request-Method": "POST",
        },
      }),
    );
    expect(res.status).toBe(403);
  });
});
