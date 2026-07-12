import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { CSRF_COOKIE } from "@z0/contracts/http";
import { APP_SESSION_COOKIE } from "../../src/api/lib/app-session";
import { closeDatabase } from "../../src/api/lib/db";
import { getDb } from "../../src/api/lib/db";
import { ensureGroupMemberForAppUser } from "../../src/api/lib/group-sso";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { resetConsumedConsentNoncesForTests } from "../../src/web/oauth/routes";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;

const ownerPassword = makeStrongPassword();
const appUserPassword = makeStrongPassword();
const REDIRECT_A = "http://localhost:3000/oauth/callback-a";
const REDIRECT_B = "http://localhost:3000/oauth/callback-b";

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

function extractCookieValue(res: Response, key: string): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${key}=`));
  const match = raw?.match(new RegExp(`${key}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function appSessionFromResponse(res: Response): string | undefined {
  return extractCookieValue(res, APP_SESSION_COOKIE);
}

function sessionCookieFromResponse(res: Response): string | undefined {
  return extractCookieValue(res, SESSION_COOKIE);
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

async function ownerLogin() {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "owner@example.com", password: ownerPassword },
    }),
  );
  return { csrf, cookie: sessionCookieFromResponse(res)! };
}

async function registerAppUser(
  clientId: string,
  email: string,
  password: string,
  name: string,
): Promise<string> {
  const registerPage = await dispatchWeb(
    new Request(`http://localhost/auth/register?client_id=${encodeURIComponent(clientId)}`),
  );
  const registerHtml = await registerPage.text();
  const registerCsrf = extractCsrfFromHtml(registerHtml)!;
  const cookie = extractCsrfFromSetCookie(registerPage) ?? registerCsrf;

  const registerRes = await dispatchWeb(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://localhost",
        host: "localhost",
        cookie: `${CSRF_COOKIE}=${encodeURIComponent(cookie)}`,
      },
      body: new URLSearchParams({
        _csrf: registerCsrf,
        client_id: clientId,
        email,
        name,
        password,
        passwordConfirm: password,
      }).toString(),
    }),
  );
  const session = appSessionFromResponse(registerRes);
  expect(session).toBeTruthy();
  return session!;
}

async function loginAppUser(clientId: string, email: string, password: string): Promise<string> {
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
        email,
        password,
      }).toString(),
    }),
  );
  const session = appSessionFromResponse(loginRes);
  expect(session).toBeTruthy();
  return session!;
}

async function approveConsent(input: {
  clientId: string;
  redirectUri: string;
  appSession: string;
  scope?: string;
}): Promise<string> {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: input.scope ?? "openid profile email",
    state: "test-state",
  });

  const consentPageRes = await dispatchWeb(
    new Request(`http://localhost/oauth/authorize?${params.toString()}`, {
      headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(input.appSession)}` },
    }),
  );
  if (consentPageRes.status === 302) {
    const location = consentPageRes.headers.get("location") ?? "";
    return new URL(location).searchParams.get("code")!;
  }

  const consentHtml = await consentPageRes.text();
  const consentCsrf = extractCsrfFromHtml(consentHtml)!;
  const consentNonce = consentHtml.match(/name="consent_nonce" value="([^"]+)"/)?.[1] ?? "";
  const consentCookieState = extractCookieValue(consentPageRes, "z0_oauth_consent")!;
  const consentCookie = extractCsrfFromSetCookie(consentPageRes) ?? consentCsrf;

  const authRes = await dispatchWeb(
    new Request("http://localhost/oauth/authorize", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://localhost",
        host: "localhost",
        cookie: `${CSRF_COOKIE}=${encodeURIComponent(consentCookie)}; z0_oauth_consent=${encodeURIComponent(consentCookieState)}; ${APP_SESSION_COOKIE}=${encodeURIComponent(input.appSession)}`,
      },
      body: new URLSearchParams({
        _csrf: consentCsrf,
        response_type: "code",
        client_id: input.clientId,
        redirect_uri: input.redirectUri,
        scope: input.scope ?? "openid profile email",
        state: "test-state",
        consent_nonce: consentNonce,
        consent: "approve",
      }).toString(),
    }),
  );
  expect(authRes.status).toBe(302);
  const location = authRes.headers.get("location") ?? "";
  return new URL(location).searchParams.get("code")!;
}

run("Group SSO flow", () => {
  let clientA = "";
  let clientB = "";
  let appAId = "";
  let appBId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    resetConsumedConsentNoncesForTests();
    await completeSetup();
    const { csrf, cookie } = await ownerLogin();

    const appARes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "Tasks App", redirectUris: [REDIRECT_A], clientType: "confidential" },
      }),
    );
    const appA = (await appARes.json()) as { app: { id: string }; credential: { clientId: string } };
    clientA = appA.credential.clientId;
    appAId = appA.app.id;

    const appBRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "Projects App", redirectUris: [REDIRECT_B], clientType: "confidential" },
      }),
    );
    const appB = (await appBRes.json()) as { app: { id: string }; credential: { clientId: string } };
    clientB = appB.credential.clientId;
    appBId = appB.app.id;

    const groupRes = await dispatchApi(
      buildRequest("POST", "/api/v1/service-groups", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          name: "Productivity",
          ssoEnabled: true,
          appIds: [appAId, appBId],
        },
      }),
    );
    expect(groupRes.status).toBe(201);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("login to app A then authorize app B skips login and consent", async () => {
    const appSessionA = await registerAppUser(
      clientA,
      "group-user@example.com",
      appUserPassword,
      "Group User",
    );
    const [sourceUser] = await getDb()`
      UPDATE app_users
      SET email_verified_at = NOW()
      WHERE app_id = ${appAId}
        AND email = 'group-user@example.com'
      RETURNING id
    `;
    await ensureGroupMemberForAppUser(
      String((sourceUser as { id: string }).id),
      appAId,
      "group-user@example.com",
    );
    await approveConsent({ clientId: clientA, redirectUri: REDIRECT_A, appSession: appSessionA });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientB,
      redirect_uri: REDIRECT_B,
      scope: "openid profile email",
      state: "sso-state",
    });

    const authorizeRes = await dispatchWeb(
      new Request(`http://localhost/oauth/authorize?${params.toString()}`, {
        headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSessionA)}` },
      }),
    );

    expect(authorizeRes.status).toBe(302);
    const location = authorizeRes.headers.get("location") ?? "";
    expect(location.startsWith(REDIRECT_B)).toBe(true);
    expect(new URL(location).searchParams.get("code")).toBeTruthy();
    expect(new URL(location).searchParams.get("state")).toBe("sso-state");

    const upgradedSession = appSessionFromResponse(authorizeRes);
    expect(upgradedSession).toBeTruthy();
    expect(upgradedSession).toBe(appSessionA);
  });

  test("an unverified matching email cannot claim an existing sibling-app account", async () => {
    await registerAppUser(clientB, "victim@example.com", appUserPassword, "Victim");
    const attackerSession = await registerAppUser(
      clientA,
      "victim@example.com",
      appUserPassword,
      "Attacker",
    );

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientB,
      redirect_uri: REDIRECT_B,
      scope: "openid profile email",
      state: "takeover-check",
    });
    const authorizeRes = await dispatchWeb(
      new Request(`http://localhost/oauth/authorize?${params.toString()}`, {
        headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(attackerSession)}` },
      }),
    );

    expect(authorizeRes.status).toBe(302);
    expect(authorizeRes.headers.get("location") ?? "").toContain("/auth/login");
    const [victimLink] = await getDb()`
      SELECT 1
      FROM service_group_app_users sgau
      JOIN app_users u ON u.id = sgau.app_user_id
      WHERE u.app_id = ${appBId}
        AND u.email = 'victim@example.com'
    `;
    expect(victimLink).toBeUndefined();
  });

  test("same-named developer scopes do not transfer consent between grouped apps", async () => {
    const { csrf, cookie } = await ownerLogin();
    for (const appId of [appAId, appBId]) {
      const scopeRes = await dispatchApi(
        buildRequest("POST", `/api/v1/apps/${appId}/scopes`, {
          csrfToken: csrf,
          cookies: { [SESSION_COOKIE]: cookie },
          body: { name: "read:records", description: `Records for ${appId}` },
        }),
      );
      expect(scopeRes.status).toBe(201);
    }

    const appSessionA = await loginAppUser(clientA, "group-user@example.com", appUserPassword);
    await approveConsent({
      clientId: clientA,
      redirectUri: REDIRECT_A,
      appSession: appSessionA,
      scope: "openid read:records",
    });
    const authorizeB = await dispatchWeb(
      new Request(
        `http://localhost/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientB)}&redirect_uri=${encodeURIComponent(REDIRECT_B)}&scope=${encodeURIComponent("openid read:records")}&state=scope-isolation`,
        { headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSessionA)}` } },
      ),
    );
    expect(authorizeB.status).toBe(200);
    expect(await authorizeB.text()).toContain("Records for");
  });

  test("apps outside a group still require separate sign-in", async () => {
    const { csrf, cookie } = await ownerLogin();

    const soloRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "Solo App", redirectUris: ["http://localhost:3000/solo"], clientType: "confidential" },
      }),
    );
    const solo = (await soloRes.json()) as { credential: { clientId: string } };

    const appSessionA = await registerAppUser(
      clientA,
      "solo-test@example.com",
      appUserPassword,
      "Solo Test User",
    );

    const params = new URLSearchParams({
      response_type: "code",
      client_id: solo.credential.clientId,
      redirect_uri: "http://localhost:3000/solo",
      scope: "openid profile email",
      state: "solo-state",
    });

    const authorizeRes = await dispatchWeb(
      new Request(`http://localhost/oauth/authorize?${params.toString()}`, {
        headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSessionA)}` },
      }),
    );

    expect(authorizeRes.status).toBe(302);
    expect(authorizeRes.headers.get("location") ?? "").toContain("/auth/login");
  });
});
