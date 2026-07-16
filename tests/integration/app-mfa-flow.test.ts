import { beforeAll, describe, expect, test } from "bun:test";
import type { BunRequest } from "bun";

import { runAppLogin } from "../../src/api/lib/app-auth";
import { completeMfaSignIn } from "../../src/api/lib/mfa-completion";
import {
  beginAppUserMfaEnrollment,
  confirmAppUserMfaEnrollment,
  getAppUserMfaStatus,
  MFA_CHALLENGE_COOKIE,
} from "../../src/api/lib/mfa";
import { generateTotpCode } from "../../src/api/lib/totp";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { APP_SESSION_COOKIE } from "../../src/api/lib/app-session";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;
const ownerPassword = makeStrongPassword("AppMfaOwner");
const appPassword = makeStrongPassword("AppMfaUser");

function cookie(response: Response, name: string): string | undefined {
  const raw = response.headers.getSetCookie?.().find((value) => value.startsWith(`${name}=`));
  const match = raw?.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

run("app-user MFA", () => {
  let appId: string;
  let appUserId: string;
  let secret: string;

  beforeAll(async () => {
    await resetTestDatabase();
    const csrf = await fetchCsrfToken(dispatchApi);
    await dispatchApi(buildRequest("POST", "/api/setup", {
      csrfToken: csrf,
      body: { name: "Owner", email: "owner@app-mfa.test", password: ownerPassword, passwordConfirm: ownerPassword, organizationName: "App MFA" },
    }));
    const ownerLogin = await dispatchApi(buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "owner@app-mfa.test", password: ownerPassword },
    }));
    const ownerSession = cookie(ownerLogin, SESSION_COOKIE)!;
    const appResponse = await dispatchApi(buildRequest("POST", "/api/v1/apps", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: ownerSession },
      body: { name: "MFA App", redirectUris: ["http://localhost/callback"], clientType: "confidential" },
    }));
    appId = String(((await appResponse.json()) as { app: { id: string } }).app.id);
    const userResponse = await dispatchApi(buildRequest("POST", `/api/v1/apps/${appId}/users`, {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: ownerSession },
      body: { email: "user@app-mfa.test", name: "App User", password: appPassword, passwordConfirm: appPassword },
    }));
    appUserId = String(((await userResponse.json()) as { userId: string }).userId);
  }, 15_000);

  test("keeps app factors scoped and blocks full app sessions until proof", async () => {
    const enrollment = await beginAppUserMfaEnrollment(appUserId, appId);
    expect(enrollment).not.toBeNull();
    secret = enrollment!.secret;
    const recovery = await confirmAppUserMfaEnrollment(
      appUserId,
      await generateTotpCode(secret, Date.now() - 30_000),
    );
    expect(recovery).toHaveLength(10);
    expect(await getAppUserMfaStatus(appUserId, appId)).toMatchObject({ enabled: true });

    const loginRequest = new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { host: "localhost", origin: "http://localhost", "user-agent": "MFA Test Browser" },
    }) as BunRequest;
    const login = await runAppLogin(loginRequest, appId, "user@app-mfa.test", appPassword, "/oauth/resume");
    expect(login.ok).toBe(true);
    if (!login.ok) throw new Error("app login failed");
    expect(login.mfaRequired).toBe(true);
    expect(login.setCookie).toStartWith(`${MFA_CHALLENGE_COOKIE}=`);

    const challengeToken = login.setCookie.match(new RegExp(`${MFA_CHALLENGE_COOKIE}=([^;]+)`))?.[1]!;
    const completionRequest = new Request("http://localhost/auth/mfa", {
      method: "POST",
      headers: {
        host: "localhost",
        origin: "http://localhost",
        "user-agent": "MFA Test Browser",
        cookie: `${MFA_CHALLENGE_COOKIE}=${challengeToken}`,
      },
    }) as BunRequest;
    const completed = await completeMfaSignIn(completionRequest, await generateTotpCode(secret));
    expect(completed.ok).toBe(true);
    if (!completed.ok) throw new Error("MFA completion failed");
    expect(completed.result.realm).toBe("app");
    expect(completed.result.appId).toBe(appId);
    expect(completed.result.setSessionCookie).toStartWith(`${APP_SESSION_COOKIE}=`);
  });
});
