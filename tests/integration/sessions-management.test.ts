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
const chromeUa =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
        password,
        passwordConfirm: password,
        organizationName: "Acme Corp",
      },
    }),
  );
}

async function login(userAgent?: string) {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      headers: userAgent ? { "user-agent": userAgent } : undefined,
      body: { email: "admin@example.com", password },
    }),
  );
  return { res, csrf, cookie: sessionCookieFromResponse(res) };
}

run("session management", () => {
  let cookieA: string | undefined;
  let cookieB: string | undefined;
  let sessionAId = "";
  let sessionBId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();

    const first = await login(chromeUa);
    expect(first.res.status).toBe(200);
    cookieA = first.cookie;

    const second = await login(chromeUa);
    expect(second.res.status).toBe(200);
    cookieB = second.cookie;

    const listRes = await dispatchApi(
      buildRequest("GET", "/api/v1/sessions", { ...withSession(cookieB) }),
    );
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as {
      sessions: { id: string; isCurrent: boolean; clientLabel: string }[];
    };
    expect(body.sessions.length).toBe(2);
    expect(body.sessions.some((s) => s.clientLabel === "Chrome on Windows")).toBe(true);
    const current = body.sessions.find((s) => s.isCurrent);
    const other = body.sessions.find((s) => !s.isCurrent);
    expect(current).toBeDefined();
    expect(other).toBeDefined();
    sessionBId = current!.id;
    sessionAId = other!.id;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("401 without session", async () => {
    const res = await dispatchApi(buildRequest("GET", "/api/v1/sessions"));
    expect(res.status).toBe(401);
  });

  test("404 for unknown session id", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("DELETE", "/api/v1/sessions/00000000-0000-4000-8000-000000000099", {
        csrfToken: csrf,
        ...withSession(cookieB),
      }),
    );
    expect(res.status).toBe(404);
  });

  test("revoke other session", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("DELETE", `/api/v1/sessions/${sessionAId}`, {
        csrfToken: csrf,
        ...withSession(cookieB),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revokedCurrent: boolean };
    expect(body.revokedCurrent).toBe(false);

    const listRes = await dispatchApi(
      buildRequest("GET", "/api/v1/sessions", { ...withSession(cookieB) }),
    );
    const list = (await listRes.json()) as { sessions: { id: string }[] };
    expect(list.sessions).toHaveLength(1);
  });

  test("revoke others leaves only current", async () => {
    const extra = await login(chromeUa);
    const csrf = await fetchCsrfToken(dispatchApi);
    const before = await dispatchApi(
      buildRequest("GET", "/api/v1/sessions", { ...withSession(extra.cookie) }),
    );
    const beforeBody = (await before.json()) as { sessions: unknown[] };
    expect(beforeBody.sessions.length).toBeGreaterThan(1);

    const res = await dispatchApi(
      buildRequest("POST", "/api/v1/sessions/revoke-others", {
        csrfToken: csrf,
        ...withSession(extra.cookie),
      }),
    );
    expect(res.status).toBe(200);
    const revoked = (await res.json()) as { revokedCount: number };
    expect(revoked.revokedCount).toBeGreaterThan(0);

    const after = await dispatchApi(
      buildRequest("GET", "/api/v1/sessions", { ...withSession(extra.cookie) }),
    );
    const afterBody = (await after.json()) as { sessions: { isCurrent: boolean }[] };
    expect(afterBody.sessions).toHaveLength(1);
    expect(afterBody.sessions[0]?.isCurrent).toBe(true);
  });

  test("revoke current session clears auth", async () => {
    const fresh = await login(chromeUa);
    const listRes = await dispatchApi(
      buildRequest("GET", "/api/v1/sessions", { ...withSession(fresh.cookie) }),
    );
    const list = (await listRes.json()) as { sessions: { id: string; isCurrent: boolean }[] };
    const currentId = list.sessions.find((s) => s.isCurrent)!.id;

    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("DELETE", `/api/v1/sessions/${currentId}`, {
        csrfToken: csrf,
        ...withSession(fresh.cookie),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revokedCurrent: boolean };
    expect(body.revokedCurrent).toBe(true);

    const sessionRes = await dispatchApi(
      buildRequest("GET", "/api/auth/session", { ...withSession(fresh.cookie) }),
    );
    const session = (await sessionRes.json()) as { authenticated: boolean };
    expect(session.authenticated).toBe(false);
  });
});
