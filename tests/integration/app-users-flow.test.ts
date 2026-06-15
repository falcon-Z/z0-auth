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
const appUserPassword = makeStrongPassword();
const appBPassword = makeStrongPassword();
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

async function createApp(csrf: string, cookie: string, name: string) {
  const res = await dispatchApi(
    buildRequest("POST", "/api/v1/apps", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: cookie },
      body: { name, redirectUris: [REDIRECT], clientType: "confidential" },
    }),
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as { app: { id: string } };
  return body.app.id;
}

run("M05 app users (Option B)", () => {
  let appId = "";
  let appBId = "";
  let userId = "";
  let inviteToken = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
    const { csrf, cookie } = await login();
    appId = await createApp(csrf, cookie, "Users App A");
    appBId = await createApp(csrf, cookie, "Users App B");
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("non-member cannot list app users", async () => {
    const res = await dispatchApi(buildRequest("GET", `/api/v1/apps/${appId}/users`));
    expect(res.status).toBe(401);
  });

  test("create app user", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          email: "enduser@example.com",
          name: "End User",
          password: appUserPassword,
          passwordConfirm: appUserPassword,
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { userId: string; email: string; membershipStatus: string };
    userId = body.userId;
    expect(body.email).toBe("enduser@example.com");
    expect(body.membershipStatus).toBe("active");
  });

  test("list and search app users", async () => {
    const { cookie } = await login();
    const listRes = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/users`, {
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { users: { email: string }[] };
    expect(list.users.some((u) => u.email === "enduser@example.com")).toBe(true);

    const searchRes = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/users?q=enduser`, {
        cookies: { [SESSION_COOKIE]: cookie },
      }),
    );
    expect(searchRes.status).toBe(200);
    const search = (await searchRes.json()) as { users: unknown[] };
    expect(search.users.length).toBe(1);
  });

  test("same email on another app creates separate account", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appBId}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          email: "enduser@example.com",
          name: "End User B",
          password: appBPassword,
          passwordConfirm: appBPassword,
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { userId: string; appId: string };
    expect(body.appId).toBe(appBId);
    expect(body.userId).not.toBe(userId);
  });

  test("disable app user membership", async () => {
    const { csrf, cookie } = await login();
    const res = await dispatchApi(
      buildRequest("PATCH", `/api/v1/apps/${appId}/users/${userId}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { membershipStatus: "disabled" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { membershipStatus: string };
    expect(body.membershipStatus).toBe("disabled");
  });

  test("create invite and accept as new user", async () => {
    const { csrf, cookie } = await login();
    const inviteRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/users/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { email: "invited@example.com", invitedName: "Invited User" },
      }),
    );
    expect(inviteRes.status).toBe(201);
    const invite = (await inviteRes.json()) as { inviteUrl: string };
    inviteToken = new URL(invite.inviteUrl).pathname.split("/").pop() ?? "";

    const previewRes = await dispatchApi(
      buildRequest("GET", `/api/v1/app-invites/${inviteToken}`),
    );
    expect(previewRes.status).toBe(200);
    const preview = (await previewRes.json()) as { accountExists: boolean };
    expect(preview.accountExists).toBe(false);

    const invitedPassword = makeStrongPassword();
    const acceptCsrf = await fetchCsrfToken(dispatchApi);
    const acceptRes = await dispatchApi(
      buildRequest("POST", `/api/v1/app-invites/${inviteToken}/accept`, {
        csrfToken: acceptCsrf,
        body: {
          name: "Invited User",
          password: invitedPassword,
          passwordConfirm: invitedPassword,
        },
      }),
    );
    expect(acceptRes.status).toBe(200);
  });

  test("duplicate app user returns conflict", async () => {
    const { csrf, cookie } = await login();
    await dispatchApi(
      buildRequest("PATCH", `/api/v1/apps/${appId}/users/${userId}`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { membershipStatus: "active" },
      }),
    );

    const res = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          email: "enduser@example.com",
          name: "End User",
          password: appUserPassword,
          passwordConfirm: appUserPassword,
        },
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { errors?: { code: string }[] };
    expect(body.errors?.some((e) => e.code === "app_user_exists")).toBe(true);
  });
});
