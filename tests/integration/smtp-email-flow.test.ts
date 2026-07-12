import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { ErrorCodes } from "@z0/contracts/errors";
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
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

const ownerPassword = makeStrongPassword();

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
        body: {
          name: "Reset App",
          redirectUris: ["http://localhost:3000/reset-callback"],
          clientType: "confidential",
        },
      }),
    );
    const app = (await appRes.json()) as {
      app: { id: string };
      credential: { clientId: string };
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

    resetCapturedEmailsForTests();
    const appForgotCsrf = await fetchCsrfToken(dispatchApi);
    const appForgotRes = await dispatchApi(
      buildRequest("POST", "/api/auth/forgot-password", {
        csrfToken: appForgotCsrf,
        body: { email: "reset-user@example.com", clientId: app.credential.clientId },
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
          clientId: app.credential.clientId,
          password,
          passwordConfirm: password,
        },
      }),
    );
    const appResetResults = await Promise.all([
      appResetRequest(firstAppPassword),
      appResetRequest(secondAppPassword),
    ]);
    expect(appResetResults.map((response) => response.status).sort()).toEqual([200, 400]);

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
