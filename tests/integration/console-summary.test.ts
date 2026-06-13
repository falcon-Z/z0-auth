import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const password = makeStrongPassword();

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
        name: "Admin User",
        email: "admin@example.com",
        password,
        passwordConfirm: password,
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
      body: { email: "admin@example.com", password },
    }),
  );
  return sessionCookieFromResponse(res);
}

run("console summary", () => {
  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("GET /api/v1/console/summary returns instance metrics", async () => {
    const cookie = await login();
    expect(cookie).toBeDefined();

    const res = await dispatchApi(
      buildRequest("GET", "/api/v1/console/summary", {
        cookies: { [SESSION_COOKIE]: cookie! },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      instance: {
        organizationName: string;
        memberCount: number;
        pendingInviteCount: number;
        appCount: number;
      };
      sessions: { activeCount: number };
    };

    expect(body.instance.organizationName).toBe("Acme Corp");
    expect(body.instance.memberCount).toBeGreaterThanOrEqual(1);
    expect(body.instance.appCount).toBe(0);
    expect(body.sessions.activeCount).toBeGreaterThanOrEqual(1);
  });

  test("GET /api/v1/console/summary requires session", async () => {
    const res = await dispatchApi(buildRequest("GET", "/api/v1/console/summary"));
    expect(res.status).toBe(401);
  });
});
