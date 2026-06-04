import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { ErrorCodes } from "@z0/contracts/errors";
import { closeDatabase } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { resetInstanceKeysForTests } from "../../src/api/lib/instance-keys";
import { getCapturedEmails, resetCapturedEmailsForTests } from "../../src/api/lib/smtp-mail";
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
    process.env.Z0_SMTP_CAPTURE = "1";
    resetInstanceKeysForTests();
    const { initializeInstanceKeys } = await import("../../src/api/lib/instance-keys");
    await initializeInstanceKeys();
    await resetTestDatabase();
    resetRateLimitsForTests();
    resetCapturedEmailsForTests();
    await completeSetup();
  });

  afterAll(async () => {
    delete process.env.Z0_SMTP_CAPTURE;
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
    const resetRes = await dispatchApi(
      buildRequest("POST", "/api/auth/reset-password", {
        csrfToken: resetCsrf,
        body: {
          token: rawToken,
          password: newPassword,
          passwordConfirm: newPassword,
        },
      }),
    );
    expect(resetRes.status).toBe(200);

    const loginCsrf = await fetchCsrfToken(dispatchApi);
    const loginRes = await dispatchApi(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: loginCsrf,
        body: { email: "owner@example.com", password: newPassword },
      }),
    );
    expect(loginRes.status).toBe(200);

    const reuseRes = await dispatchApi(
      buildRequest("POST", "/api/auth/reset-password", {
        csrfToken: resetCsrf,
        body: {
          token: rawToken,
          password: newPassword,
          passwordConfirm: newPassword,
        },
      }),
    );
    expect(reuseRes.status).toBe(400);
  });
});
