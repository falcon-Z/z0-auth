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

async function createApp(csrf: string, cookie: string) {
  const res = await dispatchApi(
    buildRequest("POST", "/api/v1/apps", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: cookie },
      body: { name: "Scopes App", redirectUris: [REDIRECT] },
    }),
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string };
  return body.id;
}

run("M04 application scopes", () => {
  let appId = "";
  let scopeId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
    const { csrf, cookie } = await login();
    appId = await createApp(csrf, cookie);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("non-member cannot list scopes", async () => {
    const res = await dispatchApi(buildRequest("GET", `/api/v1/apps/${appId}/scopes`));
    expect(res.status).toBe(401);
  });

  test("unknown app returns 404", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("GET", "/api/v1/apps/00000000-0000-4000-8000-000000000099/scopes", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(res.status).toBe(404);
  });

  test("create and list scopes", async () => {
    const { csrf, cookie } = await login();

    const create = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/scopes`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "read:orders", description: "Read orders" },
      }),
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string; name: string; description: string };
    scopeId = created.id;
    expect(created.name).toBe("read:orders");
    expect(created.description).toBe("Read orders");

    const list = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/scopes`, {
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as { scopes: { name: string }[] };
    expect(body.scopes.map((s) => s.name)).toContain("read:orders");
  });

  test("rejects invalid scope name", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/scopes`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "Bad Scope!" },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors: { field: string; code: string }[] };
    expect(body.errors.some((e) => e.field === "name" && e.code === "invalid_scope")).toBe(true);
  });

  test("rejects duplicate scope name", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/scopes`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "read:orders" },
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { errors: { code: string }[] };
    expect(body.errors.some((e) => e.code === "scope_taken")).toBe(true);
  });

  test("patch scope description", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("PATCH", `/api/v1/apps/${appId}/scopes/${scopeId}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { description: "Updated note" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { description: string };
    expect(body.description).toBe("Updated note");
  });

  test("delete scope", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("DELETE", `/api/v1/apps/${appId}/scopes/${scopeId}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(res.status).toBe(200);

    const list = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/scopes`, {
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    const body = (await list.json()) as { scopes: unknown[] };
    expect(body.scopes).toHaveLength(0);
  });
});
