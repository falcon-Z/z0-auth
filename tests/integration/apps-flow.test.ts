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
  let secondaryCredentialId = "";
  let publicAppId = "";
  let publicCredentialId = "";

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

  test("create app requires CSRF", async () => {
    const { cookie } = await login();
    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          name: "No CSRF App",
          redirectUris: [REDIRECT],
          clientType: "confidential",
        },
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { errors: { code: string }[] };
    expect(body.errors.some((e) => e.code === "csrf_invalid")).toBe(true);
  });

  test("create confidential app with default credential", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          name: "Dogfood App",
          redirectUris: [REDIRECT],
          clientType: "confidential",
        },
      }),
    );
    expect(res.status).toBe(201);
    const created = (await res.json()) as {
      app: { id: string; slug: string; status: string; clientType: string; activeCredentialCount: number };
      credential: { id: string; clientId: string };
      clientSecret: string;
    };
    appId = created.app.id;
    credentialId = created.credential.id;
    clientId = created.credential.clientId;
    expect(created.app.slug).toBe("dogfood-app");
    expect(created.app.status).toBe("active");
    expect(created.app.clientType).toBe("confidential");
    expect(created.app.activeCredentialCount).toBe(1);
    expect(created.clientSecret.length).toBeGreaterThan(20);
    expect(clientId.startsWith("z0_")).toBe(true);
  });

  test("create public app without client secret", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          name: "SPA App",
          redirectUris: [REDIRECT],
          clientType: "public",
        },
      }),
    );
    expect(res.status).toBe(201);
    const created = (await res.json()) as {
      app: { id: string; clientType: string };
      credential: { id: string; clientId: string };
      clientSecret: string | null;
    };
    publicAppId = created.app.id;
    publicCredentialId = created.credential.id;
    expect(created.app.clientType).toBe("public");
    expect(created.clientSecret).toBeNull();
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
          clientType: "confidential",
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors: { code: string }[] };
    expect(body.errors.some((e) => e.code === "invalid_redirect_uri")).toBe(true);
  });

  test("rotate confidential credential secret", async () => {
    const { csrf, cookie } = await login();

    const missingCsrf = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/credentials`, {
        cookies: { [SESSION_COOKIE]: cookie },
        body: { label: "No CSRF" },
      }),
    );
    expect(missingCsrf.status).toBe(403);

    const createRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/credentials`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { label: "Secondary" },
      }),
    );
    expect(createRes.status).toBe(201);
    secondaryCredentialId = ((await createRes.clone().json()) as { credential: { id: string } }).credential.id;

    const listRes = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/credentials`, {
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { credentials: { id: string }[] };
    expect(listed.credentials).toHaveLength(2);

    const rotateRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/credentials/${credentialId}/rotate`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(rotateRes.status).toBe(200);
    const rotated = (await rotateRes.json()) as { clientSecret: string; credential: { clientId: string } };
    expect(rotated.credential.clientId).toBe(clientId);
    expect(rotated.clientSecret).not.toBeNull();
  });

  test("cannot rotate secret on public client", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${publicAppId}/credentials/${publicCredentialId}/rotate`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { errors: { code: string }[] };
    expect(body.errors.some((e) => e.code === "public_client_no_secret")).toBe(true);
  });

  test("cannot add second credential to public app", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${publicAppId}/credentials`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {},
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { errors: { code: string }[] };
    expect(body.errors.some((e) => e.code === "credential_limit_reached")).toBe(true);
  });

  test("cannot revoke last active credential on active app", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("DELETE", `/api/v1/apps/${publicAppId}/credentials/${publicCredentialId}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { errors: { code: string }[] };
    expect(body.errors.some((e) => e.code === "last_active_credential")).toBe(true);
  });

  test("concurrent revocations cannot remove every active credential", async () => {
    const { csrf, cookie } = await login();
    const revoke = (id: string) => dispatchApi(
      buildRequest("DELETE", `/api/v1/apps/${appId}/credentials/${id}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    const responses = await Promise.all([revoke(credentialId), revoke(secondaryCredentialId)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
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
