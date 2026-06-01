import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase, getDb } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { updatePlatformUserStatus } from "../../src/api/lib/users";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const adminPassword = makeStrongPassword();
const bobPassword = makeStrongPassword();
const newPassword = makeStrongPassword();

function sessionCookieFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function withSession(cookie?: string): { cookies?: Record<string, string> } {
  if (!cookie) return {};
  return { cookies: { [SESSION_COOKIE]: cookie } };
}

async function completeSetup() {
  const csrf = await fetchCsrfToken(dispatchApi);
  await dispatchApi(
    buildRequest("POST", "/api/setup", {
      csrfToken: csrf,
      body: {
        name: "Admin User",
        email: "admin@example.com",
        password: adminPassword,
        passwordConfirm: adminPassword,
        organizationName: "Acme Corp",
      },
    }),
  );
}

async function login(email: string, password: string, existingCookie?: string) {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      ...withSession(existingCookie),
      body: { email, password },
    }),
  );
  return { res, csrf, cookie: sessionCookieFromResponse(res) ?? existingCookie };
}

run("platform user lifecycle", () => {
  let adminUserId = "";
  let bobUserId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();

    const { res, cookie: adminCookie } = await login("admin@example.com", adminPassword);
    expect(res.status).toBe(200);
    const session = (await res.json()) as { user: { id: string } };
    adminUserId = session.user.id;

    const csrf = await fetchCsrfToken(dispatchApi);
    const [tenant] = await getDb()`SELECT id FROM tenants LIMIT 1`;
    const tenantId = String((tenant as { id: string }).id);

    const inviteRes = await dispatchApi(
      buildRequest("POST", `/api/v1/tenants/${tenantId}/invites`, {
        csrfToken: csrf,
        ...withSession(adminCookie),
        body: {
          email: "bob@example.com",
          invitedName: "Bob User",
          roleKeys: ["tenant_member"],
        },
      }),
    );
    expect(inviteRes.status).toBe(201);
    const invite = (await inviteRes.json()) as { inviteUrl: string };
    const token = new URL(invite.inviteUrl).pathname.split("/").pop() ?? "";

    const acceptRes = await dispatchApi(
      buildRequest("POST", `/api/v1/invites/${token}/accept`, {
        csrfToken: csrf,
        body: {
          name: "Bob User",
          password: bobPassword,
          passwordConfirm: bobPassword,
        },
      }),
    );
    expect(acceptRes.status).toBe(200);
    const accepted = (await acceptRes.json()) as { userId: string };
    bobUserId = accepted.userId;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("lists users for platform admin", async () => {
    const { cookie } = await login("admin@example.com", adminPassword);
    const res = await dispatchApi(
      buildRequest("GET", "/api/v1/users", withSession(cookie)),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: { email: string; status: string }[] };
    expect(body.users.length).toBeGreaterThanOrEqual(2);
    expect(body.users.some((u) => u.email === "bob@example.com")).toBe(true);
  });

  test("denies user list without platform:users:read", async () => {
    const { cookie } = await login("bob@example.com", bobPassword);
    const res = await dispatchApi(
      buildRequest("GET", "/api/v1/users", withSession(cookie)),
    );
    expect(res.status).toBe(403);
  });

  test("admin disables user and login fails", async () => {
    const { cookie, csrf } = await login("admin@example.com", adminPassword);
    const patchRes = await dispatchApi(
      buildRequest("PATCH", `/api/v1/users/${bobUserId}`, {
        csrfToken: csrf,
        ...withSession(cookie),
        body: { status: "disabled" },
      }),
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { status: string };
    expect(patched.status).toBe("disabled");

    const loginRes = await dispatchApi(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "bob@example.com", password: bobPassword },
      }),
    );
    expect(loginRes.status).toBe(401);
  });

  test("cannot disable self", async () => {
    const { cookie, csrf } = await login("admin@example.com", adminPassword);
    const res = await dispatchApi(
      buildRequest("PATCH", `/api/v1/users/${adminUserId}`, {
        csrfToken: csrf,
        ...withSession(cookie),
        body: { status: "disabled" },
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { errors?: { code: string }[] };
    expect(body.errors?.some((e) => e.code === "cannot_disable_self")).toBe(true);
  });

  test("cannot disable last platform administrator", async () => {
    await getDb()`UPDATE users SET status = 'active' WHERE id = ${bobUserId}`;

    const actorId = "00000000-0000-0000-0000-000000000099";
    const result = await updatePlatformUserStatus(actorId, adminUserId, { status: "disabled" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    const body = (await result.response.json()) as { errors?: { code: string }[] };
    expect(body.errors?.some((e) => e.code === "last_platform_admin")).toBe(true);
  });

  test("change password revokes other sessions", async () => {
    await getDb()`UPDATE users SET status = 'active' WHERE id = ${bobUserId}`;

    const first = await login("bob@example.com", bobPassword);
    expect(first.res.status).toBe(200);
    const second = await login("bob@example.com", bobPassword, first.cookie);
    expect(second.res.status).toBe(200);

    const csrf = await fetchCsrfToken(dispatchApi);
    const changeRes = await dispatchApi(
      buildRequest("POST", "/api/auth/change-password", {
        csrfToken: csrf,
        ...withSession(second.cookie),
        body: {
          currentPassword: bobPassword,
          password: newPassword,
          passwordConfirm: newPassword,
        },
      }),
    );
    expect(changeRes.status).toBe(200);

    const staleSession = await dispatchApi(
      buildRequest("GET", "/api/auth/session", withSession(first.cookie)),
    );
    const staleBody = (await staleSession.json()) as { authenticated: boolean };
    expect(staleBody.authenticated).toBe(false);

    const currentSession = await dispatchApi(
      buildRequest("GET", "/api/auth/session", withSession(second.cookie)),
    );
    const currentBody = (await currentSession.json()) as { authenticated: boolean };
    expect(currentBody.authenticated).toBe(true);

    const oldLogin = await dispatchApi(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "bob@example.com", password: bobPassword },
      }),
    );
    expect(oldLogin.status).toBe(401);

    const newLogin = await login("bob@example.com", newPassword);
    expect(newLogin.res.status).toBe(200);
  });

  test("change password rejects wrong current password", async () => {
    const { cookie, csrf } = await login("bob@example.com", newPassword);
    const res = await dispatchApi(
      buildRequest("POST", "/api/auth/change-password", {
        csrfToken: csrf,
        ...withSession(cookie),
        body: {
          currentPassword: "WrongPassword123!@#",
          password: makeStrongPassword(),
          passwordConfirm: makeStrongPassword(),
        },
      }),
    );
    expect(res.status).toBe(401);
  });
});
