import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { ErrorCodes } from "@z0/contracts/errors";
import { APP_SESSION_COOKIE } from "../../src/api/lib/app-session";
import { closeDatabase } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { resetInstanceKeysForTests } from "../../src/api/lib/instance-keys";
import {
  captureEmailsForTests,
  getCapturedEmails,
  resetCapturedEmailsForTests,
  restoreEmailDeliveryForTests,
} from "../../src/api/lib/smtp-mail";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { approveOAuthConsent, loginApplicationIdentity } from "../helpers/oauth";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;

const ownerPassword = makeStrongPassword();

function sessionCookieFromResponse(res: Response): string | undefined {
  return cookieFromResponse(res, SESSION_COOKIE);
}

function cookieFromResponse(res: Response, name: string): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${name}=`));
  const match = raw?.match(new RegExp(`${name}=([^;]+)`));
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

async function login() {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "owner@example.com", password: ownerPassword },
    }),
  );
  return { csrf, cookie: sessionCookieFromResponse(res)! };
}

async function issueOAuthTokens(input: {
  clientId: string;
  clientSecret: string;
  appSession: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const code = await approveOAuthConsent(dispatchWeb, {
    clientId: input.clientId,
    redirectUri: "http://localhost:3000/reset-callback",
    appSession: input.appSession,
    scope: "openid",
    state: "recovery-test",
  });
  const token = await dispatchWeb(new Request("http://localhost/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "http://localhost:3000/reset-callback",
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }),
  }));
  expect(token.status).toBe(200);
  const body = (await token.json()) as { access_token: string; refresh_token: string };
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

run("M08 SMTP and password reset", () => {
  beforeAll(async () => {
    captureEmailsForTests();
    resetInstanceKeysForTests();
    const { initializeInstanceKeys } = await import("../../src/api/lib/instance-keys");
    await initializeInstanceKeys();
    await resetTestDatabase();
    resetRateLimitsForTests();
    resetCapturedEmailsForTests();
    await completeSetup();
  });

  afterAll(async () => {
    restoreEmailDeliveryForTests();
    await closeDatabase();
  });

  test("password reset unavailable before SMTP configured", async () => {
    const csrf = await fetchCsrfToken(dispatchApi);
    const res = await dispatchApi(
      buildRequest("POST", "/api/auth/forgot-password", {
        csrfToken: csrf,
        body: { email: "owner@example.com" },
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    const codes = (body.errors ?? []).map((e: { code: string }) => e.code);
    expect(codes).toContain(ErrorCodes.PASSWORD_RESET_UNAVAILABLE);
  });

  test("configure SMTP, test send, and complete password reset", async () => {
    const { csrf, cookie } = await login();

    const putRes = await dispatchApi(
      buildRequest("PUT", "/api/v1/settings/email", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          host: "smtp.test",
          port: 587,
          encryption: "starttls",
          username: "smtp-user",
          password: "smtp-secret",
          fromAddress: "noreply@example.com",
          fromName: "Acme IAM",
          enabled: true,
        },
      }),
    );
    expect(putRes.status).toBe(200);
    const settings = await putRes.json();
    expect(settings.configured).toBe(true);
    expect(settings.hasPassword).toBe(true);
    expect(settings.enabled).toBe(true);

    const testRes = await dispatchApi(
      buildRequest("POST", "/api/v1/settings/email/test", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { to: "owner@example.com" },
      }),
    );
    expect(testRes.status).toBe(200);

    const appRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {name: "Reset App", initialClient: {label: "Test client", clientType: "confidential", purpose: "interactive", redirectUris: ["http://localhost:3000/reset-callback"], refreshEnabled: true, browserOrigins: []}},
      }),
    );
    const app = (await appRes.json()) as {
      app: { id: string };
      client: { clientId: string };
      clientSecret: string;
    };
    const initialAppPassword = makeStrongPassword();
    const appUserRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${app.app.id}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          email: "reset-user@example.com",
          name: "Reset User",
          password: initialAppPassword,
          passwordConfirm: initialAppPassword,
        },
      }),
    );
    expect(appUserRes.status).toBe(201);
    const unaffectedAppPassword = makeStrongPassword();
    const unaffectedUserRes = await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${app.app.id}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          email: "unaffected-reset-user@example.com",
          name: "Unaffected User",
          password: unaffectedAppPassword,
          passwordConfirm: unaffectedAppPassword,
        },
      }),
    );
    expect(unaffectedUserRes.status).toBe(201);

    const preRecoverySession = await loginApplicationIdentity(dispatchWeb, {
      clientId: app.client.clientId,
      email: "reset-user@example.com",
      password: initialAppPassword,
    });
    const preRecoveryTokens = await issueOAuthTokens({
      clientId: app.client.clientId,
      clientSecret: app.clientSecret,
      appSession: preRecoverySession,
    });
    const unaffectedSession = await loginApplicationIdentity(dispatchWeb, {
      clientId: app.client.clientId,
      email: "unaffected-reset-user@example.com",
      password: unaffectedAppPassword,
    });
    const unaffectedTokens = await issueOAuthTokens({
      clientId: app.client.clientId,
      clientSecret: app.clientSecret,
      appSession: unaffectedSession,
    });
    const rotatedBeforeRecovery = await dispatchWeb(new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": "recovery-refresh-rotation",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: preRecoveryTokens.refreshToken,
        client_id: app.client.clientId,
        client_secret: app.clientSecret,
      }),
    }));
    expect(rotatedBeforeRecovery.status).toBe(200);
    const rotatedTokens = (await rotatedBeforeRecovery.json()) as {
      access_token: string;
      refresh_token: string;
    };

    resetCapturedEmailsForTests();
    const appForgotCsrf = await fetchCsrfToken(dispatchApi);
    const appForgotRes = await dispatchApi(
      buildRequest("POST", "/api/auth/forgot-password", {
        csrfToken: appForgotCsrf,
        body: { email: "reset-user@example.com", clientId: app.client.clientId },
      }),
    );
    expect(appForgotRes.status).toBe(200);
    const appResetToken = decodeURIComponent(
      getCapturedEmails()[0]!.text.match(/\/auth\/reset-password\/([^?\s]+)/)![1]!,
    );
    const firstAppPassword = makeStrongPassword();
    const secondAppPassword = makeStrongPassword();
    const appResetRequest = (password: string) => dispatchApi(
      buildRequest("POST", "/api/auth/reset-password", {
        csrfToken: appForgotCsrf,
        body: {
          token: appResetToken,
          clientId: app.client.clientId,
          password,
          passwordConfirm: password,
        },
      }),
    );
    const racingRefreshRequest = dispatchWeb(new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: rotatedTokens.refresh_token,
        client_id: app.client.clientId,
        client_secret: app.clientSecret,
      }),
    }));
    const [firstAppReset, secondAppReset, racingRefresh] = await Promise.all([
      appResetRequest(firstAppPassword),
      appResetRequest(secondAppPassword),
      racingRefreshRequest,
    ]);
    const appResetResults = [firstAppReset, secondAppReset];
    expect(appResetResults.map((response) => response.status).sort()).toEqual([200, 400]);
    expect([200, 400]).toContain(racingRefresh.status);
    const racingTokens = racingRefresh.status === 200
      ? await racingRefresh.json() as { access_token: string; refresh_token: string }
      : null;

    const sessionsAfterRecovery = await dispatchWeb(
      new Request(
        `http://localhost/auth/sessions?client_id=${encodeURIComponent(app.client.clientId)}`,
        {
          headers: {
            cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(preRecoverySession!)}`,
          },
        },
      ),
    );
    expect(sessionsAfterRecovery.status).toBe(302);
    expect(sessionsAfterRecovery.headers.get("location")).toContain("/auth/login");

    const refreshAfterRecovery = await dispatchWeb(new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": "recovery-refresh-rotation",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: preRecoveryTokens.refreshToken,
        client_id: app.client.clientId,
        client_secret: app.clientSecret,
      }),
    }));
    expect(refreshAfterRecovery.status).toBe(400);
    const replacementAfterRecovery = await dispatchWeb(new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: rotatedTokens.refresh_token,
        client_id: app.client.clientId,
        client_secret: app.clientSecret,
      }),
    }));
    expect(replacementAfterRecovery.status).toBe(400);
    for (const accessToken of [preRecoveryTokens.accessToken, rotatedTokens.access_token]) {
      const accessAfterRecovery = await dispatchWeb(new Request("http://localhost/oauth/userinfo", {
        headers: { authorization: `Bearer ${accessToken}` },
      }));
      expect(accessAfterRecovery.status).toBe(401);
    }
    if (racingTokens) {
      const racingRefreshAfterRecovery = await dispatchWeb(new Request("http://localhost/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: racingTokens.refresh_token,
          client_id: app.client.clientId,
          client_secret: app.clientSecret,
        }),
      }));
      expect(racingRefreshAfterRecovery.status).toBe(400);
      const racingAccessAfterRecovery = await dispatchWeb(new Request("http://localhost/oauth/userinfo", {
        headers: { authorization: `Bearer ${racingTokens.access_token}` },
      }));
      expect(racingAccessAfterRecovery.status).toBe(401);
    }
    const unaffectedRefresh = await dispatchWeb(new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: unaffectedTokens.refreshToken,
        client_id: app.client.clientId,
        client_secret: app.clientSecret,
      }),
    }));
    expect(unaffectedRefresh.status).toBe(200);

    resetCapturedEmailsForTests();

    const forgotCsrf = await fetchCsrfToken(dispatchApi);
    const forgotRes = await dispatchApi(
      buildRequest("POST", "/api/auth/forgot-password", {
        csrfToken: forgotCsrf,
        body: { email: "owner@example.com" },
      }),
    );
    expect(forgotRes.status).toBe(200);

    const captured = getCapturedEmails();
    expect(captured.length).toBe(1);
    expect(captured[0]!.to).toBe("owner@example.com");
    const linkMatch = captured[0]!.text.match(/\/auth\/reset-password\/([^\s]+)/);
    expect(linkMatch).not.toBeNull();
    const rawToken = decodeURIComponent(linkMatch![1]!);
    expect(rawToken.includes(".")).toBe(true);

    const resetCsrf = await fetchCsrfToken(dispatchApi);
    const newPassword = makeStrongPassword();
    const competingPassword = makeStrongPassword();
    const resetRequest = (password: string) => dispatchApi(
      buildRequest("POST", "/api/auth/reset-password", {
        csrfToken: resetCsrf,
        body: {
          token: rawToken,
          password,
          passwordConfirm: password,
        },
      }),
    );
    const [firstReset, competingReset] = await Promise.all([
      resetRequest(newPassword),
      resetRequest(competingPassword),
    ]);
    expect([firstReset.status, competingReset.status].sort()).toEqual([200, 400]);
    const acceptedPassword = firstReset.status === 200 ? newPassword : competingPassword;

    const loginCsrf = await fetchCsrfToken(dispatchApi);
    const loginRes = await dispatchApi(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: loginCsrf,
        body: { email: "owner@example.com", password: acceptedPassword },
      }),
    );
    expect(loginRes.status).toBe(200);

    const reuseRes = await dispatchApi(
      buildRequest("POST", "/api/auth/reset-password", {
        csrfToken: resetCsrf,
        body: {
          token: rawToken,
          password: acceptedPassword,
          passwordConfirm: acceptedPassword,
        },
      }),
    );
    expect(reuseRes.status).toBe(400);
  });
});
