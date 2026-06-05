import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase, getDb } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const ownerPassword = makeStrongPassword();
const newPassword = makeStrongPassword();

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

async function login(password = ownerPassword, existingCookie?: string) {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      ...withSession(existingCookie),
      body: { email: "owner@example.com", password },
    }),
  );
  return { res, csrf, cookie: sessionCookieFromResponse(res) ?? existingCookie };
}

function withSession(cookie?: string): { cookies?: Record<string, string> } {
  if (!cookie) return {};
  return { cookies: { [SESSION_COOKIE]: cookie } };
}

run("change password", () => {
  let ownerUserId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
    const { res } = await login();
    expect(res.status).toBe(200);
    const session = (await res.json()) as { user: { id: string } };
    ownerUserId = session.user.id;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("change password revokes other sessions", async () => {
    await getDb()`UPDATE users SET status = 'active' WHERE id = ${ownerUserId}`;

    const first = await login(ownerPassword);
    expect(first.res.status).toBe(200);
    const second = await login(ownerPassword, first.cookie);
    expect(second.res.status).toBe(200);

    const csrf = await fetchCsrfToken(dispatchApi);
    const changeRes = await dispatchApi(
      buildRequest("POST", "/api/auth/change-password", {
        csrfToken: csrf,
        ...withSession(second.cookie),
        body: {
          currentPassword: ownerPassword,
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
        body: { email: "owner@example.com", password: ownerPassword },
      }),
    );
    expect(oldLogin.status).toBe(401);

    const newLogin = await login(newPassword);
    expect(newLogin.res.status).toBe(200);
  });

  test("change password rejects wrong current password", async () => {
    const { cookie, csrf } = await login(newPassword);
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
