import { beforeAll, describe, expect, test } from "bun:test";

import type { MfaEnrollment, MfaRecoveryCodes } from "@z0/contracts/mfa";
import { MFA_CHALLENGE_COOKIE } from "../../src/api/lib/mfa";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { generateTotpCode } from "../../src/api/lib/totp";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;
const password = makeStrongPassword("MfaOwner");

function cookieFromResponse(response: Response, name: string): string | undefined {
  const raw = response.headers.getSetCookie?.().find((cookie) => cookie.startsWith(`${name}=`));
  const match = raw?.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

run("console MFA", () => {
  let csrf: string;
  let session: string;
  let secret: string;
  let recoveryCodes: string[];

  beforeAll(async () => {
    await resetTestDatabase();
    csrf = await fetchCsrfToken(dispatchApi);
    const setup = await dispatchApi(buildRequest("POST", "/api/setup", {
      csrfToken: csrf,
      body: {
        name: "MFA Owner",
        email: "mfa-owner@example.com",
        password,
        passwordConfirm: password,
        organizationName: "MFA Test",
      },
    }));
    expect(setup.status).toBe(201);
    const login = await dispatchApi(buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "mfa-owner@example.com", password },
    }));
    session = cookieFromResponse(login, SESSION_COOKIE)!;
  }, 15_000);

  test("enrolls with an encrypted TOTP seed and returns recovery codes once", async () => {
    const start = await dispatchApi(buildRequest("POST", "/api/auth/mfa/enrollment", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: session },
    }));
    expect(start.status).toBe(201);
    expect(start.headers.get("cache-control")).toBe("no-store");
    const enrollment = (await start.json()) as MfaEnrollment;
    secret = enrollment.secret;
    expect(enrollment.provisioningUri).toStartWith("otpauth://totp/");

    const confirm = await dispatchApi(buildRequest("POST", "/api/auth/mfa/enrollment/confirm", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: session },
      body: { code: await generateTotpCode(secret, Date.now() - 30_000) },
    }));
    expect(confirm.status).toBe(200);
    recoveryCodes = ((await confirm.json()) as MfaRecoveryCodes).recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);

    const status = await dispatchApi(buildRequest("GET", "/api/auth/mfa", {
      cookies: { [SESSION_COOKIE]: session },
    }));
    expect(await status.json()).toMatchObject({ enabled: true, recoveryCodesRemaining: 10 });
  });

  test("does not issue a full session until the MFA challenge succeeds", async () => {
    const login = await dispatchApi(buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "mfa-owner@example.com", password },
    }));
    expect(login.status).toBe(202);
    expect(cookieFromResponse(login, SESSION_COOKIE)).toBeUndefined();
    const challenge = cookieFromResponse(login, MFA_CHALLENGE_COOKIE)!;
    expect(challenge).toBeDefined();

    const invalid = await dispatchApi(buildRequest("POST", "/api/auth/mfa/challenge", {
      csrfToken: csrf,
      cookies: { [MFA_CHALLENGE_COOKIE]: challenge },
      body: { code: "000000" },
    }));
    expect(invalid.status).toBe(401);

    const complete = await dispatchApi(buildRequest("POST", "/api/auth/mfa/challenge", {
      csrfToken: csrf,
      cookies: { [MFA_CHALLENGE_COOKIE]: challenge },
      body: { code: await generateTotpCode(secret) },
    }));
    expect(complete.status).toBe(200);
    expect(cookieFromResponse(complete, SESSION_COOKIE)).toBeDefined();

    const replay = await dispatchApi(buildRequest("POST", "/api/auth/mfa/challenge", {
      csrfToken: csrf,
      cookies: { [MFA_CHALLENGE_COOKIE]: challenge },
      body: { code: await generateTotpCode(secret) },
    }));
    expect(replay.status).toBe(401);
  });

  test("consumes each recovery code only once", async () => {
    const firstLogin = await dispatchApi(buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "mfa-owner@example.com", password },
    }));
    const firstChallenge = cookieFromResponse(firstLogin, MFA_CHALLENGE_COOKIE)!;
    const recovered = await dispatchApi(buildRequest("POST", "/api/auth/mfa/challenge", {
      csrfToken: csrf,
      cookies: { [MFA_CHALLENGE_COOKIE]: firstChallenge },
      body: { code: recoveryCodes[0] },
    }));
    expect(recovered.status).toBe(200);

    const secondLogin = await dispatchApi(buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "mfa-owner@example.com", password },
    }));
    const secondChallenge = cookieFromResponse(secondLogin, MFA_CHALLENGE_COOKIE)!;
    const reused = await dispatchApi(buildRequest("POST", "/api/auth/mfa/challenge", {
      csrfToken: csrf,
      cookies: { [MFA_CHALLENGE_COOKIE]: secondChallenge },
      body: { code: recoveryCodes[0] },
    }));
    expect(reused.status).toBe(401);
  });

  test("rotates remembered-browser tokens and detects reuse", async () => {
    const login = await dispatchApi(buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "mfa-owner@example.com", password },
    }));
    const challenge = cookieFromResponse(login, MFA_CHALLENGE_COOKIE)!;
    const complete = await dispatchApi(buildRequest("POST", "/api/auth/mfa/challenge", {
      csrfToken: csrf,
      cookies: { [MFA_CHALLENGE_COOKIE]: challenge },
      body: { code: recoveryCodes[1], rememberBrowser: true },
    }));
    expect(complete.status).toBe(200);
    const remembered = cookieFromResponse(complete, "z0_mfa_remember")!;
    expect(remembered).toBeDefined();

    const bypassed = await dispatchApi(buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      cookies: { z0_mfa_remember: remembered },
      body: { email: "mfa-owner@example.com", password },
    }));
    expect(bypassed.status).toBe(200);
    expect(cookieFromResponse(bypassed, SESSION_COOKIE)).toBeDefined();
    expect(cookieFromResponse(bypassed, "z0_mfa_remember")).not.toBe(remembered);

    const reused = await dispatchApi(buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      cookies: { z0_mfa_remember: remembered },
      body: { email: "mfa-owner@example.com", password },
    }));
    expect(reused.status).toBe(202);
    expect(cookieFromResponse(reused, MFA_CHALLENGE_COOKIE)).toBeDefined();
  });
});
