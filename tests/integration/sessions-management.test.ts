import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { closeDatabase, getDb } from "../../src/api/lib/db";
import { sha256Hex } from "../../src/api/lib/crypto";
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

function auditPayload(row: unknown): { reason?: string } {
  const payload = (row as { payload: unknown }).payload;
  return typeof payload === "string"
    ? JSON.parse(payload) as { reason?: string }
    : payload as { reason?: string };
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
      sessions: {
        id: string;
        isCurrent: boolean;
        clientLabel: string;
        assuranceLevel: string;
        authenticationMethod: string;
        primaryAuthenticatedAt: string;
        mfaAuthenticatedAt: string | null;
        createdAt: string;
        idleExpiresAt: string;
        absoluteExpiresAt: string;
      }[];
    };
    expect(body.sessions.length).toBe(2);
    expect(body.sessions.some((s) => s.clientLabel === "Chrome on Windows")).toBe(true);
    const current = body.sessions.find((s) => s.isCurrent);
    const other = body.sessions.find((s) => !s.isCurrent);
    expect(current).toBeDefined();
    expect(current).toMatchObject({
      assuranceLevel: "primary",
      authenticationMethod: "password",
      mfaAuthenticatedAt: null,
    });
    expect(new Date(current!.primaryAuthenticatedAt).getTime()).toBeGreaterThan(0);
    expect(new Date(current!.idleExpiresAt).getTime()).toBeGreaterThan(
      new Date(current!.createdAt).getTime(),
    );
    expect(new Date(current!.absoluteExpiresAt).getTime()).toBeGreaterThan(
      new Date(current!.idleExpiresAt).getTime(),
    );
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

    const auditRows = await getDb()`
      SELECT action FROM audit_events
      WHERE resource_type = 'session' AND resource_id = ${sessionAId}
    `;
    expect(auditRows.map((row: unknown) => String((row as { action: string }).action))).toContain(
      "session.revoked",
    );

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

  test("idle expiry is enforced by shared database state and audited once", async () => {
    const fresh = await login(chromeUa);
    const token = fresh.cookie!;
    const tokenHash = await sha256Hex(token);
    const db = getDb();
    const [row] = await db`
      UPDATE sessions
      SET idle_expires_at = NOW() - INTERVAL '1 second'
      WHERE token_hash = ${tokenHash}
      RETURNING id
    `;

    const requests = await Promise.all([
      dispatchApi(buildRequest("GET", "/api/auth/session", { ...withSession(token) })),
      dispatchApi(buildRequest("GET", "/api/auth/session", { ...withSession(token) })),
    ]);
    for (const response of requests) {
      expect(await response.json()).toEqual({ authenticated: false });
    }

    const auditRows = await db`
      SELECT action, payload
      FROM audit_events
      WHERE resource_type = 'session' AND resource_id = ${String((row as { id: string }).id)}
        AND action = 'session.expired'
    `;
    expect(auditRows).toHaveLength(1);
    expect(auditPayload(auditRows[0]).reason).toBe("idle_timeout");
  });

  test("absolute expiry is enforced and audited", async () => {
    const fresh = await login(chromeUa);
    const token = fresh.cookie!;
    const tokenHash = await sha256Hex(token);
    const db = getDb();
    const [row] = await db`
      UPDATE sessions
      SET expires_at = NOW() - INTERVAL '1 second',
          idle_expires_at = NOW() - INTERVAL '1 second'
      WHERE token_hash = ${tokenHash}
      RETURNING id
    `;

    const response = await dispatchApi(
      buildRequest("GET", "/api/auth/session", { ...withSession(token) }),
    );
    expect(await response.json()).toEqual({ authenticated: false });
    const [audit] = await db`
      SELECT payload FROM audit_events
      WHERE resource_type = 'session' AND resource_id = ${String((row as { id: string }).id)}
        AND action = 'session.expired'
    `;
    expect(auditPayload(audit).reason).toBe("absolute_timeout");
  });

  test("primary-only Operators reauthenticate when authentication is stale", async () => {
    const fresh = await login(chromeUa);
    const token = fresh.cookie!;
    const tokenHash = await sha256Hex(token);
    await getDb()`
      UPDATE sessions SET primary_authenticated_at = NOW() - INTERVAL '11 minutes'
      WHERE token_hash = ${tokenHash}
    `;

    const stale = await dispatchApi(buildRequest("POST", "/api/auth/change-password", {
      csrfToken: await fetchCsrfToken(dispatchApi),
      ...withSession(token),
      body: {},
    }));
    expect(stale.status).toBe(403);
    expect(await stale.json()).toMatchObject({
      requiredAssurance: "primary",
      reauthentication: { method: "password", path: "/api/auth/reauthenticate" },
      errors: [{ code: "primary_reauthentication_required" }],
    });

    const missingPassword = await dispatchApi(buildRequest("POST", "/api/auth/reauthenticate", {
      csrfToken: await fetchCsrfToken(dispatchApi),
      ...withSession(token),
      body: {},
    }));
    expect(missingPassword.status).toBe(400);
    expect(await missingPassword.json()).toMatchObject({
      errors: [{ field: "password", code: "required" }],
    });

    const renewed = await dispatchApi(buildRequest("POST", "/api/auth/reauthenticate", {
      csrfToken: await fetchCsrfToken(dispatchApi),
      ...withSession(token),
      body: { password },
    }));
    expect(renewed.status).toBe(200);

    const after = await dispatchApi(buildRequest("POST", "/api/auth/change-password", {
      csrfToken: await fetchCsrfToken(dispatchApi),
      ...withSession(token),
      body: {},
    }));
    expect(after.status).toBe(400);
  });

  test("account state is rechecked from shared state on every request", async () => {
    const fresh = await login(chromeUa);
    const token = fresh.cookie!;
    const tokenHash = await sha256Hex(token);
    const [row] = await getDb()`SELECT id, user_id FROM sessions WHERE token_hash = ${tokenHash}`;
    const sessionId = String((row as { id: string }).id);
    const userId = String((row as { user_id: string }).user_id);
    await getDb()`UPDATE users SET disabled_at = NOW() WHERE id = ${userId}`;
    try {
      const response = await dispatchApi(
        buildRequest("GET", "/api/auth/session", { ...withSession(token) }),
      );
      expect(await response.json()).toEqual({ authenticated: false });
      const [audit] = await getDb()`
        SELECT action, payload FROM audit_events
        WHERE resource_type = 'session' AND resource_id = ${sessionId}
          AND action = 'session.revoked_account_state'
      `;
      expect(audit).toBeDefined();
      expect(auditPayload(audit).reason).toBe("disabled");
    } finally {
      await getDb()`UPDATE users SET disabled_at = NULL WHERE id = ${userId}`;
    }
  });
});
