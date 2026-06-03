import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const ownerPassword = makeStrongPassword();
const REDIRECT = "http://localhost:3000/oauth/callback";

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

async function login() {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "owner@example.com", password: ownerPassword },
    }),
  );
  return { csrf, cookie: sessionCookieFromResponse(res)! };
}

run("M03 applications and credentials", () => {
  let appId = "";
  let credentialId = "";
  let clientId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("non-member cannot list apps", async () => {
    const res = await dispatchApi(buildRequest("GET", "/api/v1/apps"));
    expect(res.status).toBe(401);
  });

  test("create app with redirect URIs", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          name: "Dogfood App",
          redirectUris: [REDIRECT],
        },
      }),
    );
    expect(res.status).toBe(201);
    const app = (await res.json()) as { id: string; slug: string; status: string };
    appId = app.id;
    expect(app.slug).toBe("dogfood-app");
    expect(app.status).toBe("active");
  });

  test("reject invalid redirect URI", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          name: "Bad URIs",
          redirectUris: ["not-a-url"],
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors: { code: string }[] };
    expect(body.errors.some((e) => e.code === "invalid_redirect_uri")).toBe(true);
  });

  test("create and rotate credential", async () => {
    const { csrf, cookie } = await login();

    const createRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/credentials`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { label: "Primary" },
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      credential: { id: string; clientId: string };
      clientSecret: string;
    };
    credentialId = created.credential.id;
    clientId = created.credential.clientId;
    expect(created.clientSecret.length).toBeGreaterThan(20);
    expect(clientId.startsWith("z0_")).toBe(true);

    const listRes = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/credentials`, {
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { credentials: { id: string }[] };
    expect(listed.credentials).toHaveLength(1);

    const rotateRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/credentials/${credentialId}/rotate`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(rotateRes.status).toBe(200);
    const rotated = (await rotateRes.json()) as { clientSecret: string; credential: { clientId: string } };
    expect(rotated.credential.clientId).toBe(clientId);
    expect(rotated.clientSecret).not.toBe(created.clientSecret);
  });

  test("cannot revoke last active credential on active app", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("DELETE", `/api/v1/apps/${appId}/credentials/${credentialId}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { errors: { code: string }[] };
    expect(body.errors.some((e) => e.code === "last_active_credential")).toBe(true);
  });

  test("disable app blocks new credentials", async () => {
    const { csrf, cookie } = await login();
    const patchRes = await dispatchApi(
      buildRequest("PATCH", `/api/v1/apps/${appId}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { status: "disabled" },
      }),
    );
    expect(patchRes.status).toBe(200);

    const credRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/credentials`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {},
      }),
    );
    expect(credRes.status).toBe(409);
  });
});
