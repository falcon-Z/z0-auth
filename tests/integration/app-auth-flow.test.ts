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

const ownerPassword = makeStrongPassword();
const appUserPassword = makeStrongPassword();
const appBPassword = makeStrongPassword();
const registerPassword = makeStrongPassword();
const invitePassword = makeStrongPassword();
const REDIRECT = "http://localhost:3000/oauth/callback";

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

function appSessionFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${APP_SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${APP_SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

async function completeSetup() {
  const csrfRes = await dispatchWeb(new Request("http://localhost/auth/setup"));
  const csrf = extractCsrfFromSetCookie(csrfRes) ?? extractCsrfFromHtml(await csrfRes.text())!;
  await dispatchWeb(
    new Request("http://localhost/auth/setup", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://localhost",
        host: "localhost",
        cookie: `${CSRF_COOKIE}=${encodeURIComponent(csrf)}`,
      },
      body: new URLSearchParams({
        _csrf: csrf,
        organizationName: "Acme Corp",
        name: "Owner User",
        email: "owner@example.com",
        password: ownerPassword,
        passwordConfirm: ownerPassword,
      }).toString(),
    }),
  );
}

async function ownerLogin() {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "owner@example.com", password: ownerPassword },
    }),
  );
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  const cookie = match?.[1] ? decodeURIComponent(match[1]) : "";
  return { csrf, cookie };
}

async function createAppWithCredential(csrf: string, cookie: string, name: string) {
  const appRes = await dispatchApi(
    buildRequest("POST", "/api/v1/apps", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: cookie },
      body: { name, redirectUris: [REDIRECT] },
    }),
  );
  expect(appRes.status).toBe(201);
  const app = (await appRes.json()) as { id: string };

  const credRes = await dispatchApi(
    buildRequest("POST", `/api/v1/apps/${app.id}/credentials`, {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: cookie },
      body: { label: "Default" },
    }),
  );
  expect(credRes.status).toBe(201);
  const cred = (await credRes.json()) as { credential: { clientId: string } };
  return { appId: app.id, clientId: cred.credential.clientId };
}

run("M06 app hosted auth", () => {
  let appId = "";
  let clientId = "";
  let clientBId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
    const { csrf, cookie } = await ownerLogin();
    const appA = await createAppWithCredential(csrf, cookie, "Auth App A");
    const appB = await createAppWithCredential(csrf, cookie, "Auth App B");
    appId = appA.appId;
    clientId = appA.clientId;
    clientBId = appB.clientId;

    await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appA.appId}/users`, {
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

    await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appB.appId}/users`, {
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
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("app login page shows application context", async () => {
    const res = await dispatchWeb(
      new Request(`http://localhost/auth/login?client_id=${encodeURIComponent(clientId)}`),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Auth App A");
    expect(html).toContain("Create account");
  });

  test("app login issues z0_app_session and completes OAuth authorize", async () => {
    const loginPage = await dispatchWeb(
      new Request(`http://localhost/auth/login?client_id=${encodeURIComponent(clientId)}`),
    );
    const loginHtml = await loginPage.text();
    const loginCsrf = extractCsrfFromHtml(loginHtml)!;
    const cookie = extractCsrfFromSetCookie(loginPage) ?? loginCsrf;

    const loginRes = await dispatchWeb(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost",
          host: "localhost",
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(cookie)}`,
        },
        body: new URLSearchParams({
          _csrf: loginCsrf,
          client_id: clientId,
          email: "enduser@example.com",
          password: appUserPassword,
        }).toString(),
      }),
    );

    expect(loginRes.status).toBe(303);
    const appSession = appSessionFromResponse(loginRes);
    expect(appSession).toBeTruthy();

    const authorizeUrl = `/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(REDIRECT)}&state=abc`;
    const authRes = await dispatchWeb(
      new Request(`http://localhost${authorizeUrl}`, {
        headers: {
          cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSession!)}`,
        },
      }),
    );
    expect(authRes.status).toBe(302);
    const location = authRes.headers.get("location") ?? "";
    expect(location).toContain("code=dev-auth-code");
    expect(location).toContain("state=abc");
  });

  test("same email wrong password on another app fails", async () => {
    const loginPage = await dispatchWeb(
      new Request(`http://localhost/auth/login?client_id=${encodeURIComponent(clientBId)}`),
    );
    const loginHtml = await loginPage.text();
    const loginCsrf = extractCsrfFromHtml(loginHtml)!;
    const cookie = extractCsrfFromSetCookie(loginPage) ?? loginCsrf;

    const loginRes = await dispatchWeb(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost",
          host: "localhost",
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(cookie)}`,
        },
        body: new URLSearchParams({
          _csrf: loginCsrf,
          client_id: clientBId,
          email: "enduser@example.com",
          password: appUserPassword,
        }).toString(),
      }),
    );

    expect(loginRes.status).toBe(401);
    const html = await loginRes.text();
    expect(html).toContain("Invalid email or password");
  });

  test("self-registration creates app user and session", async () => {
    const page = await dispatchWeb(
      new Request(`http://localhost/auth/register?client_id=${encodeURIComponent(clientId)}`),
    );
    const html = await page.text();
    expect(html).toContain("Create account");

    const csrf = extractCsrfFromHtml(html)!;
    const cookie = extractCsrfFromSetCookie(page) ?? csrf;

    const res = await dispatchWeb(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost",
          host: "localhost",
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(cookie)}`,
        },
        body: new URLSearchParams({
          _csrf: csrf,
          client_id: clientId,
          name: "Self Registered",
          email: "self@example.com",
          password: registerPassword,
          passwordConfirm: registerPassword,
        }).toString(),
      }),
    );

    expect(res.status).toBe(303);
    expect(appSessionFromResponse(res)).toBeTruthy();
  });

  test("app invite accept via hosted page creates session", async () => {
    const { csrf, cookie } = await ownerLogin();
    const inviteRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/users/invites`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { email: "invited-web@example.com", invitedName: "Web Invited" },
      }),
    );
    expect(inviteRes.status).toBe(201);
    const invite = (await inviteRes.json()) as { inviteUrl: string };
    const token = new URL(invite.inviteUrl).pathname.split("/").pop() ?? "";
    expect(token).toBeTruthy();

    const page = await dispatchWeb(new Request(`http://localhost/auth/app-invite/${token}`));
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Join Auth App A");
    expect(html).toContain("invited-web@example.com");

    const pageCsrf = extractCsrfFromHtml(html)!;
    const pageCookie = extractCsrfFromSetCookie(page) ?? pageCsrf;

    const acceptRes = await dispatchWeb(
      new Request(`http://localhost/auth/app-invite/${token}`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost",
          host: "localhost",
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(pageCookie)}`,
        },
        body: new URLSearchParams({
          _csrf: pageCsrf,
          intent: "accept",
          name: "Web Invited",
          password: invitePassword,
          passwordConfirm: invitePassword,
        }).toString(),
      }),
    );

    expect(acceptRes.status).toBe(303);
    expect(appSessionFromResponse(acceptRes)).toBeTruthy();
  });

  test("console login unchanged without client_id", async () => {
    const loginPage = await dispatchWeb(new Request("http://localhost/auth/login"));
    const loginHtml = await loginPage.text();
    expect(loginHtml).toContain("console for this instance");

    const loginCsrf = extractCsrfFromHtml(loginHtml)!;
    const cookie = extractCsrfFromSetCookie(loginPage) ?? loginCsrf;

    const loginRes = await dispatchWeb(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost",
          host: "localhost",
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(cookie)}`,
        },
        body: new URLSearchParams({
          _csrf: loginCsrf,
          email: "owner@example.com",
          password: ownerPassword,
        }).toString(),
      }),
    );

    expect(loginRes.status).toBe(303);
    const sessionCookies = loginRes.headers.getSetCookie?.() ?? [];
    expect(sessionCookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(true);
    expect(sessionCookies.some((c) => c.startsWith(`${APP_SESSION_COOKIE}=`))).toBe(false);
  });
});
