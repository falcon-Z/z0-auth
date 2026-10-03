import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { CSRF_COOKIE } from "@z0/contracts/http";
import { APP_SESSION_COOKIE, createAppSession } from "../../src/api/lib/app-session";
import { closeDatabase } from "../../src/api/lib/db";
import { getDb } from "../../src/api/lib/db";
import { ensureApplicationSubject } from "../../src/api/lib/accounts";
import { changeApplicationMembership } from "../../src/api/lib/application-memberships";
import { runAppLogin } from "../../src/api/lib/app-auth";
import { beginAppUserMfaEnrollment, confirmAppUserMfaEnrollment, getAppUserMfaStatus, hasAppUserMfa, verifyAppUserMfaProof } from "../../src/api/lib/mfa";
import { completeMfaSignIn } from "../../src/api/lib/mfa-completion";
import { generateTotpCode } from "../../src/api/lib/totp";
import { tryGroupSsoSession } from "../../src/api/lib/group-sso";
import type { BunRequest } from "bun";
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
  let clientSecretB = "";
  let appAId = "";
  let appBId = "";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
    const { csrf, cookie } = await ownerLogin();

    const appARes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {name: "Tasks App", initialClient: {label: "Test client", clientType: "confidential", purpose: "interactive", redirectUris: [REDIRECT_A], refreshEnabled: true, browserOrigins: []}},
      }),
    );
    const appA = (await appARes.json()) as { app: { id: string }; client: { clientId: string } };
    clientA = appA.client.clientId;
    appAId = appA.app.id;

    const appBRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {name: "Projects App", initialClient: {label: "Test client", clientType: "confidential", purpose: "interactive", redirectUris: [REDIRECT_B], refreshEnabled: true, browserOrigins: []}},
      }),
    );
    const appB = (await appBRes.json()) as { app: { id: string }; client: { clientId: string }; clientSecret: string };
    clientSecretB = appB.clientSecret;
    clientB = appB.client.clientId;
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

  test("shared authentication requires explicit membership and does not share consent", async () => {
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
    expect(authorizeRes.headers.get("location")).toContain("/auth/login");
    expect(await getDb()`SELECT id FROM app_account_bindings WHERE app_id = ${appBId}`).toHaveLength(0);
    expect(await getDb()`SELECT id FROM accounts`).toHaveLength(1);

    const [account] = await getDb()`SELECT account_id FROM app_account_bindings WHERE id = ${sourceUser.id}`;
    const [owner] = await getDb()`SELECT id FROM users WHERE email = 'owner@example.com'`;
    const subjectB = await getDb().begin(async (tx) => {
      const subject = await ensureApplicationSubject(tx, appBId, String(account.account_id));
      expect(subject).toBeTruthy();
      await changeApplicationMembership(tx, appBId, subject!, "active", String(owner.id));
      return subject!;
    });
    await getDb()`UPDATE app_account_bindings SET metadata = '{"private":"a"}' WHERE id = ${sourceUser.id}`;
    const [target] = await getDb()`SELECT account_id, metadata FROM app_users WHERE id = ${subjectB}`;
    expect(target.account_id).toBe(account.account_id);
    expect(subjectB).not.toBe(String(sourceUser.id));
    expect(target.metadata).toBeNull();

    const reuse = await dispatchWeb(new Request(`http://localhost/oauth/authorize?${params}`, {
      headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSessionA)}` },
    }));
    expect(reuse.status).toBe(200); // Consent remains app-local until #119 removes it.
    expect(await reuse.text()).toContain('consent_nonce');
    expect(appSessionFromResponse(reuse)).toBe(appSessionA);
    expect(await getDb()`SELECT id FROM accounts`).toHaveLength(1);
    const code = await approveConsent({ clientId: clientB, redirectUri: REDIRECT_B, appSession: appSessionA, scope: "openid" });
    expect(code).toBeTruthy();
    const exchanged = await dispatchWeb(new Request("http://localhost/oauth/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientB, client_secret: clientSecretB,
        code, redirect_uri: REDIRECT_B }),
    }));
    expect(exchanged.status).toBe(200);
    const tokens = await exchanged.json() as { access_token: string; id_token: string };
    const identityClaims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1]!, 'base64url').toString());
    expect(identityClaims.sub).toBe(subjectB);
    expect(identityClaims.email).toBeUndefined();
    expect(identityClaims.name).toBeUndefined();
    const info = await dispatchWeb(new Request("http://localhost/oauth/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    }));
    expect(info.status).toBe(200);
    expect(await info.json()).toEqual({ sub: subjectB });
    const [sourceSession] = await getDb()`SELECT primary_authenticated_at FROM app_user_sessions WHERE app_user_id = ${sourceUser.id}`;
    const [targetSession] = await getDb()`SELECT primary_authenticated_at FROM app_user_sessions WHERE app_user_id = ${subjectB}`;
    expect(targetSession.primary_authenticated_at).toEqual(sourceSession.primary_authenticated_at);

    await getDb().begin(tx => changeApplicationMembership(tx, appBId, subjectB, "removed", String(owner.id)));
    expect((await tryGroupSsoSession(new Request("http://localhost", {
      headers: { cookie: `${APP_SESSION_COOKIE}=${appSessionA}` },
    }) as BunRequest, appBId)).ok).toBe(false);
    expect(await getDb()`SELECT subject_id FROM application_memberships WHERE subject_id = ${subjectB}`).toHaveLength(0);
    expect(await getDb()`SELECT id FROM accounts`).toHaveLength(1);
    await getDb().begin(tx => changeApplicationMembership(tx, appBId, subjectB, "active", String(owner.id)));
    expect((await tryGroupSsoSession(new Request("http://localhost", {
      headers: { cookie: `${APP_SESSION_COOKIE}=${appSessionA}` },
    }) as BunRequest, appBId)).ok).toBe(true);
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
        body: {name: "Solo App", initialClient: {label: "Test client", clientType: "confidential", purpose: "interactive", redirectUris: ["http://localhost:3000/solo"], refreshEnabled: true, browserOrigins: []}},
      }),
    );
    const solo = (await soloRes.json()) as { client: { clientId: string } };

    const appSessionA = await registerAppUser(
      clientA,
      "solo-test@example.com",
      appUserPassword,
      "Solo Test User",
    );

    const params = new URLSearchParams({
      response_type: "code",
      client_id: solo.client.clientId,
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
  test("shared Account MFA cannot be bypassed and verified assurance is reused", async () => {
    const weakSession = await loginAppUser(clientA, "group-user@example.com", appUserPassword);
    const [source] = await getDb()`SELECT id FROM app_users WHERE app_id = ${appAId} AND email = 'group-user@example.com'`;
    const [target] = await getDb()`SELECT id FROM app_users WHERE app_id = ${appBId} AND email = 'group-user@example.com'`;
    const enrollment = await beginAppUserMfaEnrollment(String(source.id), appAId);
    expect(enrollment).toBeTruthy();
    const recovery = await confirmAppUserMfaEnrollment(String(source.id), await generateTotpCode(enrollment!.secret, Date.now() - 30_000));
    expect(recovery).toHaveLength(10);
    expect(await hasAppUserMfa(String(target.id), appBId)).toBe(true);
    expect((await getAppUserMfaStatus(String(target.id), appBId)).recoveryCodesRemaining).toBe(10);
    expect(await beginAppUserMfaEnrollment(String(target.id), appBId)).toBeNull();
    const loginB = await runAppLogin(new Request("http://localhost/auth/login") as BunRequest,
      appBId, "group-user@example.com", appUserPassword);
    expect(loginB.ok && loginB.mfaRequired).toBe(true);
    const weakReq = new Request("http://localhost/oauth/authorize", {
      headers: { cookie: `${APP_SESSION_COOKIE}=${weakSession}` },
    }) as BunRequest;
    const stepUp = await tryGroupSsoSession(weakReq, appBId);
    expect(stepUp.ok && stepUp.mfaRequired).toBe(true);
    if (!stepUp.ok || !stepUp.mfaRequired) throw new Error("Expected shared MFA challenge");
    const completed = await completeMfaSignIn(new Request("http://localhost/auth/mfa", {
      headers: { cookie: stepUp.setCookie.split(';')[0] },
    }) as BunRequest, recovery![0]!);
    expect(completed.ok).toBe(true);
    expect((await verifyAppUserMfaProof(String(source.id), recovery![0]!)).ok).toBe(false);
    if (!completed.ok) throw new Error("Expected MFA completion");
    // Use a new browser session for B so A has no direct grant in that browser.
    const freshLoginB = await runAppLogin(new Request("http://localhost/auth/login") as BunRequest,
      appBId, "group-user@example.com", appUserPassword);
    if (!freshLoginB.ok || !freshLoginB.mfaRequired) throw new Error("Expected MFA challenge");
    const strong = await completeMfaSignIn(new Request("http://localhost/auth/mfa", {
      headers: { cookie: freshLoginB.setCookie.split(';')[0] },
    }) as BunRequest, recovery![1]!);
    if (!strong.ok) throw new Error("Expected strong session");
    const reused = await tryGroupSsoSession(new Request("http://localhost/oauth/authorize", {
      headers: { cookie: strong.result.setSessionCookie.split(';')[0] },
    }) as BunRequest, appAId);
    expect(reused.ok && !reused.mfaRequired).toBe(true);
    const [shared] = await getDb()`SELECT mfa_authenticated_at FROM app_user_sessions
      WHERE app_user_id = ${source.id} AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`;
    expect(shared.mfa_authenticated_at).toBeTruthy();
  });

  test("SSO MFA preserves aged primary proof and rejects revoked or unavailable sources", async () => {
    const [identity] = await getDb()`INSERT INTO app_users (app_id, email, name)
      VALUES (${appAId}, 'sso-step-up@example.com', 'Step Up') RETURNING id, account_id`;
    const [owner] = await getDb()`SELECT id FROM users WHERE email = 'owner@example.com'`;
    const subjectB = await getDb().begin(async tx => {
      const subject = await ensureApplicationSubject(tx, appBId, String(identity.account_id));
      if (!subject) throw new Error('Expected shared subject');
      expect(await changeApplicationMembership(tx, appBId, subject, 'active', String(owner.id))).toBe('updated');
      return subject;
    });
    const enrollment = await beginAppUserMfaEnrollment(String(identity.id), appAId);
    expect(enrollment).toBeTruthy();
    const recovery = await confirmAppUserMfaEnrollment(String(identity.id),
      await generateTotpCode(enrollment!.secret, Date.now() - 30_000));
    if (!recovery) throw new Error('Expected recovery codes');
    const primaryAt = new Date(Date.now() - 60 * 60 * 1000);
    const challenge = async () => {
      resetRateLimitsForTests();
      const req = new Request('http://localhost/oauth/authorize') as BunRequest;
      const source = await createAppSession(String(identity.id), appAId, req, {
        primaryAuthenticatedAt: primaryAt, authenticationMethod: 'password',
      });
      const stepUp = await tryGroupSsoSession(new Request(req.url, {
        headers: { cookie: `${APP_SESSION_COOKIE}=${source.token}` },
      }) as BunRequest, appBId);
      if (!stepUp.ok || !stepUp.mfaRequired) throw new Error('Expected shared MFA challenge');
      const [bound] = await getDb()`SELECT source_session_id FROM app_user_mfa_challenges
        WHERE app_user_id = ${subjectB} AND consumed_at IS NULL`;
      expect(bound.source_session_id).toBeTruthy();
      return { sourceId: String(bound.source_session_id), req: new Request('http://localhost/auth/mfa', {
        headers: { cookie: stepUp.setCookie.split(';')[0] },
      }) as BunRequest };
    };
    const first = await challenge();
    const completed = await completeMfaSignIn(first.req, recovery[0]!);
    expect(completed.ok).toBe(true);
    const [grant] = await getDb()`SELECT primary_authenticated_at, mfa_authenticated_at, authentication_method
      FROM app_user_sessions WHERE app_user_id = ${subjectB} AND revoked_at IS NULL`;
    expect(grant.primary_authenticated_at).toEqual(primaryAt);
    expect(new Date(grant.mfa_authenticated_at).getTime()).toBeGreaterThan(primaryAt.getTime());
    expect(grant.authentication_method).toBe('password+totp');
    const expectDenied = async (req: BunRequest, code: string) => {
      const result = await completeMfaSignIn(req, code);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(401);
      expect(await getDb()`SELECT id FROM app_user_sessions WHERE app_user_id = ${subjectB} AND revoked_at IS NULL`).toHaveLength(1);
    };
    const revoked = await challenge();
    await getDb()`UPDATE app_user_sessions SET revoked_at = NOW() WHERE id = ${revoked.sourceId}`;
    await expectDenied(revoked.req, recovery[1]!);
    const disabled = await challenge();
    await getDb()`UPDATE service_groups SET sso_enabled = FALSE WHERE id =
      (SELECT group_id FROM service_group_apps WHERE app_id = ${appAId})`;
    await expectDenied(disabled.req, recovery[2]!);
    await getDb()`UPDATE service_groups SET sso_enabled = TRUE WHERE id =
      (SELECT group_id FROM service_group_apps WHERE app_id = ${appAId})`;
    const unbound = await challenge();
    await getDb()`UPDATE app_user_mfa_challenges SET source_session_id = NULL
      WHERE source_session_id = ${unbound.sourceId}`;
    await expectDenied(unbound.req, recovery[3]!);
    const loggedOut = await challenge();
    await getDb()`UPDATE app_browser_sessions SET revoked_at = NOW() WHERE id =
      (SELECT browser_session_id FROM app_user_sessions WHERE id = ${loggedOut.sourceId})`;
    await expectDenied(loggedOut.req, recovery[4]!);
    const removed = await challenge();
    await getDb().begin(tx => changeApplicationMembership(tx, appAId, String(identity.id), 'removed', String(owner.id)));
    await expectDenied(removed.req, recovery[5]!);
  });

});
