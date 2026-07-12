import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { CSRF_COOKIE } from "@z0/contracts/http";
import { APP_SESSION_COOKIE } from "../../src/api/lib/app-session";
import { closeDatabase } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;

const password = makeStrongPassword();
const appUserPassword = makeStrongPassword();

function sessionCookieFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function appSessionFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${APP_SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${APP_SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function extractCsrfFromHtml(html: string): string | undefined {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  return match?.[1];
}

function extractCsrfFromSetCookie(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  const match = raw?.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
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

async function appLoginViaWeb(clientId: string): Promise<string> {
  const loginPage = await dispatchWeb(
    new Request(`http://localhost/auth/login?client_id=${encodeURIComponent(clientId)}`),
  );
  const csrf = extractCsrfFromSetCookie(loginPage) ?? extractCsrfFromHtml(await loginPage.text());
  expect(csrf).toBeDefined();

  const loginRes = await dispatchWeb(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://localhost",
        host: "localhost",
        cookie: `${CSRF_COOKIE}=${encodeURIComponent(csrf!)}`,
      },
      body: new URLSearchParams({
        _csrf: csrf!,
        client_id: clientId,
        email: "enduser@example.com",
        password: appUserPassword,
      }).toString(),
    }),
  );

  const appSession = appSessionFromResponse(loginRes);
  expect(appSession).toBeDefined();
  return appSession!;
}

run("P7 security & observability", () => {
  let sessionCookie: string;
  let csrfToken: string;
  let appId: string;
  let clientId: string;
  let appUserId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();

    const csrf = await fetchCsrfToken(dispatchApi);
    const loginRes = await dispatchApi(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "admin@example.com", password },
      }),
    );
    expect(loginRes.status).toBe(200);
    sessionCookie = sessionCookieFromResponse(loginRes)!;
    csrfToken = csrf;

    const appRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrfToken,
        cookies: { [SESSION_COOKIE]: sessionCookie },
        body: {
          name: "Audit App",
          clientType: "public",
          redirectUris: ["http://localhost:5173/callback"],
        },
      }),
    );
    expect(appRes.status).toBe(201);
    const appBody = (await appRes.json()) as {
      app: { id: string };
      credential: { clientId: string };
    };
    appId = appBody.app.id;
    clientId = appBody.credential.clientId;

    const userRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/users`, {
        csrfToken: csrfToken,
        cookies: { [SESSION_COOKIE]: sessionCookie },
        body: {
          email: "enduser@example.com",
          name: "End User",
          password: appUserPassword,
          passwordConfirm: appUserPassword,
        },
      }),
    );
    expect(userRes.status).toBe(201);
    const userBody = (await userRes.json()) as { userId: string };
    appUserId = userBody.userId;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("GET /api/v1/audit-events returns login and app events", async () => {
    const res = await dispatchApi(
      buildRequest("GET", "/api/v1/audit-events", {
        cookies: { [SESSION_COOKIE]: sessionCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      events: { action: string; resourceType: string }[];
      hasMore: boolean;
    };

    const actions = body.events.map((e) => e.action);
    expect(actions).toContain("auth.login_succeeded");
    expect(actions).toContain("app.created");
    expect(actions).toContain("app_user.created");
    expect(typeof body.hasMore).toBe("boolean");
  });

  test("GET /api/v1/audit-events filters by action", async () => {
    const res = await dispatchApi(
      buildRequest("GET", "/api/v1/audit-events?action=app.created", {
        cookies: { [SESSION_COOKIE]: sessionCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: { action: string }[] };
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events.every((e) => e.action === "app.created")).toBe(true);
  });

  test("GET /api/v1/audit-events paginates with before cursor", async () => {
    const first = await dispatchApi(
      buildRequest("GET", "/api/v1/audit-events?limit=2", {
        cookies: { [SESSION_COOKIE]: sessionCookie },
      }),
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      events: { id: string; createdAt: string }[];
      hasMore: boolean;
      nextCursor: string | null;
    };
    expect(firstBody.events.length).toBe(2);
    expect(firstBody.nextCursor).toBeTruthy();

    const second = await dispatchApi(
      buildRequest(
        "GET",
        `/api/v1/audit-events?limit=2&before=${encodeURIComponent(firstBody.nextCursor!)}`,
        { cookies: { [SESSION_COOKIE]: sessionCookie } },
      ),
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { events: { id: string; createdAt: string }[] };
    const firstPageIds = new Set(firstBody.events.map((event) => event.id));
    expect(secondBody.events.some((event) => firstPageIds.has(event.id))).toBe(false);
  });

  test("GET /api/v1/audit-events requires session", async () => {
    const res = await dispatchApi(buildRequest("GET", "/api/v1/audit-events"));
    expect(res.status).toBe(401);
  });

  test("GET /api/v1/apps/:appId/users/:userId/sessions lists app user sessions after login", async () => {
    await appLoginViaWeb(clientId);

    const res = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/users/${appUserId}/sessions`, {
        cookies: { [SESSION_COOKIE]: sessionCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sessions: { id: string; clientLabel: string }[];
    };
    expect(body.sessions.length).toBeGreaterThan(0);
    expect(body.sessions[0]?.clientLabel).toBeTruthy();
  });

  test("DELETE admin revoke removes app user session and writes audit", async () => {
    await appLoginViaWeb(clientId);

    const listRes = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/users/${appUserId}/sessions`, {
        cookies: { [SESSION_COOKIE]: sessionCookie },
      }),
    );
    const { sessions } = (await listRes.json()) as { sessions: { id: string }[] };
    expect(sessions.length).toBeGreaterThan(0);
    const sessionId = sessions[0]!.id;

    const revokeRes = await dispatchApi(
      buildRequest("DELETE", `/api/v1/apps/${appId}/users/${appUserId}/sessions/${sessionId}`, {
        csrfToken: csrfToken,
        cookies: { [SESSION_COOKIE]: sessionCookie },
      }),
    );
    expect(revokeRes.status).toBe(200);

    const auditRes = await dispatchApi(
      buildRequest("GET", "/api/v1/audit-events?action=app_user_session.revoked", {
        cookies: { [SESSION_COOKIE]: sessionCookie },
      }),
    );
    const auditBody = (await auditRes.json()) as { events: { resourceId: string }[] };
    expect(auditBody.events.some((e) => e.resourceId === sessionId)).toBe(true);

    const afterRes = await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${appId}/users/${appUserId}/sessions`, {
        cookies: { [SESSION_COOKIE]: sessionCookie },
      }),
    );
    const afterBody = (await afterRes.json()) as { sessions: { id: string }[] };
    expect(afterBody.sessions.some((s) => s.id === sessionId)).toBe(false);
  });

  test("GET /auth/sessions shows hosted session list for signed-in app user", async () => {
    const appSession = await appLoginViaWeb(clientId);

    const res = await dispatchWeb(
      new Request(
        `http://localhost/auth/sessions?client_id=${encodeURIComponent(clientId)}`,
        { headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSession)}` } },
      ),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Active sessions");
    expect(html).toContain("This device");
  });

  test("app login via hosted page writes auth.app_login_succeeded audit", async () => {
    await appLoginViaWeb(clientId);

    const res = await dispatchApi(
      buildRequest("GET", "/api/v1/audit-events?action=auth.app_login_succeeded", {
        cookies: { [SESSION_COOKIE]: sessionCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: { payload: { appUserId?: string } }[] };
    expect(body.events.some((e) => e.payload.appUserId === appUserId)).toBe(true);
  });
});
