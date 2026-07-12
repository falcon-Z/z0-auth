import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { CSRF_COOKIE } from "@z0/contracts/http";
import { APP_SESSION_COOKIE } from "../../src/api/lib/app-session";
import { closeDatabase, getDb } from "../../src/api/lib/db";
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
  return appSessionFromResponse(loginRes)!;
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
    state: "refresh-test-state",
  });

  const consentPageRes = await dispatchWeb(
    new Request(`http://localhost/oauth/authorize?${params.toString()}`, {
      headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(input.appSession)}` },
    }),
  );
  if (consentPageRes.status === 302) {
    const code = new URL(consentPageRes.headers.get("location") ?? "").searchParams.get("code");
    expect(code).toBeTruthy();
    return code!;
  }

  const consentHtml = await consentPageRes.text();
  const consentCsrf = extractCsrfFromHtml(consentHtml)!;
  const consentNonce = consentHtml.match(/name="consent_nonce" value="([^"]+)"/)?.[1] ?? "";
  const consentCookieState =
    consentPageRes.headers
      .getSetCookie?.()
      .find((c) => c.startsWith("z0_oauth_consent="))
      ?.match(/z0_oauth_consent=([^;]+)/)?.[1] ?? "";
  const consentCookie = extractCsrfFromSetCookie(consentPageRes) ?? consentCsrf;

  const authRes = await dispatchWeb(
    new Request("http://localhost/oauth/authorize", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "http://localhost",
        host: "localhost",
        cookie: `${CSRF_COOKIE}=${encodeURIComponent(consentCookie)}; z0_oauth_consent=${decodeURIComponent(consentCookieState)}; ${APP_SESSION_COOKIE}=${encodeURIComponent(input.appSession)}`,
      },
      body: new URLSearchParams({
        _csrf: consentCsrf,
        response_type: "code",
        client_id: input.clientId,
        redirect_uri: input.redirectUri,
        scope: input.scope ?? "openid profile email",
        state: "refresh-test-state",
        consent_nonce: consentNonce,
        consent: "approve",
      }).toString(),
    }),
  );
  const location = authRes.headers.get("location") ?? "";
  return new URL(location).searchParams.get("code")!;
}

async function exchangeToken(body: Record<string, string>): Promise<Response> {
  return dispatchWeb(
    new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    }),
  );
}

run("OAuth refresh token lifecycle", () => {
  let clientId = "";
  let clientSecret = "";
  let appId = "";
  let appUserEmail = "refresh-user@example.com";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    resetConsumedConsentNoncesForTests();
    await completeSetup();
    const { csrf, cookie } = await ownerLogin();

    const appRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "Refresh App", redirectUris: [REDIRECT], clientType: "confidential" },
      }),
    );
    const app = (await appRes.json()) as {
      app: { id: string };
      credential: { clientId: string };
      clientSecret: string;
    };
    clientId = app.credential.clientId;
    clientSecret = app.clientSecret;
    appId = app.app.id;

    await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${app.app.id}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          email: appUserEmail,
          name: "Refresh User",
          password: appUserPassword,
          passwordConfirm: appUserPassword,
        },
      }),
    );
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("code exchange returns refresh_token", async () => {
    const appSession = await loginAppUser(clientId, appUserEmail, appUserPassword);
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(tokenRes.status).toBe(200);
    const token = (await tokenRes.json()) as { refresh_token?: string; access_token: string };
    expect(token.refresh_token?.startsWith("z0_rt_")).toBe(true);
    expect(token.access_token.startsWith("z0_at_")).toBe(true);
  });

  test("refresh_token grant rotates tokens", async () => {
    const appSession = await loginAppUser(clientId, appUserEmail, appUserPassword);
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const first = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const firstBody = (await first.json()) as { refresh_token: string; access_token: string };

    const refreshed = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: firstBody.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(refreshed.status).toBe(200);
    const refreshedBody = (await refreshed.json()) as { refresh_token: string; access_token: string };
    expect(refreshedBody.refresh_token).not.toBe(firstBody.refresh_token);
    expect(refreshedBody.access_token).not.toBe(firstBody.access_token);

    const reuse = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: firstBody.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(reuse.status).toBe(400);
    const reuseBody = (await reuse.json()) as { error: string };
    expect(reuseBody.error).toBe("invalid_grant");

    const secondRefresh = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: refreshedBody.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(secondRefresh.status).toBe(400);
    const secondRefreshBody = (await secondRefresh.json()) as { error: string };
    expect(secondRefreshBody.error).toBe("invalid_grant");
  });

  test("revoking refresh token rejects further refresh", async () => {
    const appSession = await loginAppUser(clientId, appUserEmail, appUserPassword);
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const token = (await tokenRes.json()) as { refresh_token: string };

    const revokeRes = await dispatchWeb(
      new Request("http://localhost/oauth/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: token.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      }),
    );
    expect(revokeRes.status).toBe(200);

    const refreshRes = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(refreshRes.status).toBe(400);
  });

  test("deleted scopes cannot be renewed by a refresh token", async () => {
    const appSession = await loginAppUser(clientId, appUserEmail, appUserPassword);
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const token = (await tokenRes.json()) as { refresh_token: string };

    await getDb()`DELETE FROM app_scopes WHERE app_id = ${appId} AND name = 'profile'`;
    const refreshRes = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(refreshRes.status).toBe(400);
    expect(((await refreshRes.json()) as { error: string }).error).toBe("invalid_grant");
  });
});
