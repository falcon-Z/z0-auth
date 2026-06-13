import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type { SessionResponse } from "@z0/contracts/auth";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { closeDatabase } from "../../src/api/lib/db";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const strongPassword = makeStrongPassword();

async function completeSetup() {
  const csrf = await fetchCsrfToken(dispatchApi);
  await dispatchApi(
    buildRequest("POST", "/api/setup", {
      csrfToken: csrf,
      body: {
        name: "Auth Admin",
        email: "auth@example.com",
        password: strongPassword,
        passwordConfirm: strongPassword,
        organizationName: "Auth Test",
      },
    }),
  );
  return csrf;
}

function sessionCookieFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

run("auth flow", () => {
  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
  });

  test("login sets session cookie and returns user", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "auth@example.com", password: strongPassword },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as SessionResponse;
    expect(body.authenticated).toBe(true);
    expect(body.isInstanceMember).toBe(true);
    expect(body.isBootstrap).toBe(true);
    expect(body.organizationName).toBe("Auth Test");
    expect(sessionCookieFromResponse(res)).toBeDefined();
  });

  test("session reflects authentication", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const loginRes = await dispatchApi(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "auth@example.com", password: strongPassword },
      }),
    );
    const token = sessionCookieFromResponse(loginRes)!;
    const sessionRes = await dispatchApi(
      buildRequest("GET", "/api/auth/session", {
        cookies: { [SESSION_COOKIE]: token },
      }),
    );
    const session = (await sessionRes.json()) as SessionResponse;
    expect(session.authenticated).toBe(true);
  });

  test("logout clears session", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const loginRes = await dispatchApi(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "auth@example.com", password: strongPassword },
      }),
    );
    const token = sessionCookieFromResponse(loginRes)!;
    await dispatchApi(
      buildRequest("POST", "/api/auth/logout", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: token },
      }),
    );
    const sessionRes = await dispatchApi(buildRequest("GET", "/api/auth/session"));
    const session = (await sessionRes.json()) as SessionResponse;
    expect(session.authenticated).toBe(false);
  });
});

afterAll(async () => {
  await closeDatabase();
});
