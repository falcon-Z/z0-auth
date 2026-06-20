import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { CSRF_COOKIE } from "@z0/contracts/http";
import { APP_SESSION_COOKIE } from "../../src/api/lib/app-session";
import { closeDatabase } from "../../src/api/lib/db";
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

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkceVerifier(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
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
  const session = appSessionFromResponse(loginRes);
  expect(session).toBeTruthy();
  return session!;
}

async function approveConsent(input: {
  clientId: string;
  redirectUri: string;
  appSession: string;
  scope?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}): Promise<string> {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: input.scope ?? "openid profile email",
    state: input.state ?? "test-state",
  });
  if (input.codeChallenge) {
    params.set("code_challenge", input.codeChallenge);
    params.set("code_challenge_method", input.codeChallengeMethod ?? "S256");
  }

  const consentPageRes = await dispatchWeb(
    new Request(`http://localhost/oauth/authorize?${params.toString()}`, {
      headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(input.appSession)}` },
    }),
  );
  if (consentPageRes.status === 302) {
    const location = consentPageRes.headers.get("location") ?? "";
    const code = new URL(location).searchParams.get("code");
    expect(code).toBeTruthy();
    return code!;
  }
  expect(consentPageRes.status).toBe(200);
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
        state: input.state ?? "test-state",
        code_challenge: input.codeChallenge ?? "",
        code_challenge_method: input.codeChallengeMethod ?? "",
        consent_nonce: consentNonce,
        consent: "approve",
      }).toString(),
    }),
  );
  expect(authRes.status).toBe(302);
  const location = authRes.headers.get("location") ?? "";
  const code = new URL(location).searchParams.get("code");
  expect(code).toBeTruthy();
  return code!;
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

run("OAuth authorization code flow", () => {
  let confidentialClientId = "";
  let confidentialSecret = "";
  let confidentialAppId = "";
  let publicClientId = "";
  let publicAppId = "";
  let appUserEmail = "oauth-user@example.com";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    resetConsumedConsentNoncesForTests();
    await completeSetup();
    const { csrf, cookie } = await ownerLogin();

    const confidentialRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "OAuth Confidential", redirectUris: [REDIRECT], clientType: "confidential" },
      }),
    );
    const confidential = (await confidentialRes.json()) as {
      app: { id: string };
      credential: { clientId: string };
      clientSecret: string;
    };
    confidentialClientId = confidential.credential.clientId;
    confidentialSecret = confidential.clientSecret;
    confidentialAppId = confidential.app.id;

    const publicRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "OAuth Public", redirectUris: [REDIRECT], clientType: "public" },
      }),
    );
    const publicApp = (await publicRes.json()) as { app: { id: string }; credential: { clientId: string } };
    publicClientId = publicApp.credential.clientId;
    publicAppId = publicApp.app.id;

    await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${confidentialAppId}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          email: appUserEmail,
          name: "OAuth User",
          password: appUserPassword,
          passwordConfirm: appUserPassword,
        },
      }),
    );

    await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${confidentialAppId}/scopes`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "read:orders", description: "Read orders" },
      }),
    );

    await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${publicAppId}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          email: appUserEmail,
          name: "OAuth Public User",
          password: appUserPassword,
          passwordConfirm: appUserPassword,
        },
      }),
    );
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("new apps include default OIDC scopes", async () => {
    const { cookie } = await ownerLogin();
    const scopes = (await dispatchApi(
      buildRequest("GET", `/api/v1/apps/${confidentialAppId}/scopes`, { cookies: { [SESSION_COOKIE]: cookie } }),
    ).then((r) => r.json())) as { scopes: Array<{ name: string }> };
    const names = scopes.scopes.map((s) => s.name).sort();
    expect(names).toContain("openid");
    expect(names).toContain("profile");
    expect(names).toContain("email");
  });

  test("confidential client completes code flow with client_secret", async () => {
    const appSession = await loginAppUser(confidentialClientId, appUserEmail, appUserPassword);
    const code = await approveConsent({
      clientId: confidentialClientId,
      redirectUri: REDIRECT,
      appSession,
    });

    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: confidentialClientId,
      client_secret: confidentialSecret,
    });
    expect(tokenRes.status).toBe(200);
    const token = (await tokenRes.json()) as { access_token: string; token_type: string; expires_in: number };
    expect(token.access_token.startsWith("z0_at_")).toBe(true);
    expect(token.token_type).toBe("Bearer");
    expect(token.expires_in).toBeGreaterThan(0);
    expect(token.refresh_token?.startsWith("z0_rt_")).toBe(true);
  });

  test("public client requires PKCE at authorize", async () => {
    const appSession = await loginAppUser(publicClientId, appUserEmail, appUserPassword);
    const res = await dispatchWeb(
      new Request(
        `http://localhost/oauth/authorize?response_type=code&client_id=${encodeURIComponent(publicClientId)}&redirect_uri=${encodeURIComponent(REDIRECT)}&state=pkce-state`,
        { headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSession)}` } },
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("pkce_required");
  });

  test("public client requires state on authorize", async () => {
    const appSession = await loginAppUser(publicClientId, appUserEmail, appUserPassword);
    const verifier = createPkceVerifier();
    const challenge = await pkceChallengeFromVerifier(verifier);
    const res = await dispatchWeb(
      new Request(
        `http://localhost/oauth/authorize?response_type=code&client_id=${encodeURIComponent(publicClientId)}&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`,
        { headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSession)}` } },
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("invalid_request");
  });

  test("public client completes PKCE code flow", async () => {
    const appSession = await loginAppUser(publicClientId, appUserEmail, appUserPassword);
    const verifier = createPkceVerifier();
    const challenge = await pkceChallengeFromVerifier(verifier);
    const code = await approveConsent({
      clientId: publicClientId,
      redirectUri: REDIRECT,
      appSession,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      state: "public-pkce-state",
    });

    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: publicClientId,
      code_verifier: verifier,
    });
    expect(tokenRes.status).toBe(200);
  });

  test("unknown client_id returns invalid_client", async () => {
    const res = await dispatchWeb(
      new Request(
        `http://localhost/oauth/authorize?response_type=code&client_id=z0_unknown&redirect_uri=${encodeURIComponent(REDIRECT)}`,
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("invalid_client");
  });

  test("invalid redirect_uri is rejected", async () => {
    const res = await dispatchWeb(
      new Request(
        `http://localhost/oauth/authorize?response_type=code&client_id=${encodeURIComponent(confidentialClientId)}&redirect_uri=${encodeURIComponent("http://evil.example/callback")}`,
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("invalid_redirect_uri");
  });

  test("unregistered scope is rejected", async () => {
    const appSession = await loginAppUser(confidentialClientId, appUserEmail, appUserPassword);
    const res = await dispatchWeb(
      new Request(
        `http://localhost/oauth/authorize?response_type=code&client_id=${encodeURIComponent(confidentialClientId)}&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=unknown:scope`,
        { headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSession)}` } },
      ),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("invalid_scope");
  });

  test("deny consent returns access_denied", async () => {
    const appSession = await loginAppUser(confidentialClientId, appUserEmail, appUserPassword);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: confidentialClientId,
      redirect_uri: REDIRECT,
      state: "deny-state",
    });
    const consentPageRes = await dispatchWeb(
      new Request(`http://localhost/oauth/authorize?${params.toString()}`, {
        headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSession)}` },
      }),
    );
    const consentHtml = await consentPageRes.text();
    const consentCsrf = extractCsrfFromHtml(consentHtml)!;
    const consentNonce = consentHtml.match(/name="consent_nonce" value="([^"]+)"/)?.[1] ?? "";
    const consentCookieState = extractCookieValue(consentPageRes, "z0_oauth_consent")!;
    const consentCookie = extractCsrfFromSetCookie(consentPageRes) ?? consentCsrf;

    const denyRes = await dispatchWeb(
      new Request("http://localhost/oauth/authorize", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "http://localhost",
          host: "localhost",
          cookie: `${CSRF_COOKIE}=${encodeURIComponent(consentCookie)}; z0_oauth_consent=${encodeURIComponent(consentCookieState)}; ${APP_SESSION_COOKIE}=${encodeURIComponent(appSession)}`,
        },
        body: new URLSearchParams({
          _csrf: consentCsrf,
          response_type: "code",
          client_id: confidentialClientId,
          redirect_uri: REDIRECT,
          state: "deny-state",
          consent_nonce: consentNonce,
          consent: "deny",
        }).toString(),
      }),
    );
    expect(denyRes.status).toBe(302);
    const location = new URL(denyRes.headers.get("location") ?? "");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("deny-state");
  });

  test("reused authorization code is rejected", async () => {
    const appSession = await loginAppUser(confidentialClientId, appUserEmail, appUserPassword);
    const code = await approveConsent({
      clientId: confidentialClientId,
      redirectUri: REDIRECT,
      appSession,
    });

    const first = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: confidentialClientId,
      client_secret: confidentialSecret,
    });
    expect(first.status).toBe(200);

    const second = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: confidentialClientId,
      client_secret: confidentialSecret,
    });
    expect(second.status).toBe(400);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe("invalid_grant");
  });

  test("revoke invalidates access token for userinfo", async () => {
    const appSession = await loginAppUser(confidentialClientId, appUserEmail, appUserPassword);
    const code = await approveConsent({
      clientId: confidentialClientId,
      redirectUri: REDIRECT,
      appSession,
      scope: "openid profile email",
    });

    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: confidentialClientId,
      client_secret: confidentialSecret,
    });
    const token = (await tokenRes.json()) as { access_token: string };

    const userinfoOk = await dispatchWeb(
      new Request("http://localhost/oauth/userinfo", {
        headers: { authorization: `Bearer ${token.access_token}` },
      }),
    );
    expect(userinfoOk.status).toBe(200);

    const revokeRes = await dispatchWeb(
      new Request("http://localhost/oauth/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: token.access_token,
          client_id: confidentialClientId,
          client_secret: confidentialSecret,
        }).toString(),
      }),
    );
    expect(revokeRes.status).toBe(200);

    const userinfoAfter = await dispatchWeb(
      new Request("http://localhost/oauth/userinfo", {
        headers: { authorization: `Bearer ${token.access_token}` },
      }),
    );
    expect(userinfoAfter.status).toBe(401);
  });

  test("skips consent when prior approval covers requested scopes", async () => {
    const appSession = await loginAppUser(confidentialClientId, appUserEmail, appUserPassword);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: confidentialClientId,
      redirect_uri: REDIRECT,
      scope: "openid profile email",
      state: "skip-state",
    });
    const res = await dispatchWeb(
      new Request(`http://localhost/oauth/authorize?${params.toString()}`, {
        headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSession)}` },
      }),
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("code")).toBeTruthy();
    expect(location.searchParams.get("state")).toBe("skip-state");
  });

  test("re-prompts consent when app requests a new scope", async () => {
    const appSession = await loginAppUser(confidentialClientId, appUserEmail, appUserPassword);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: confidentialClientId,
      redirect_uri: REDIRECT,
      scope: "openid profile email read:orders",
      state: "expand-state",
    });
    const res = await dispatchWeb(
      new Request(`http://localhost/oauth/authorize?${params.toString()}`, {
        headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSession)}` },
      }),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("read:orders");
    expect(html).toContain("Read orders");
  });

  test("consent page shows app branding name", async () => {
    const { csrf, cookie } = await ownerLogin();
    await dispatchApi(
      buildRequest("PUT", `/api/v1/apps/${publicAppId}/sign-in`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          signInMethods: ["password"],
          branding: { name: "Branded OAuth App", logoUrl: null, primaryColor: null },
        },
      }),
    );

    const brandedUserEmail = "branded-user@example.com";
    await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${publicAppId}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          email: brandedUserEmail,
          name: "Branded User",
          password: appUserPassword,
          passwordConfirm: appUserPassword,
        },
      }),
    );

    const verifier = createPkceVerifier();
    const challenge = await pkceChallengeFromVerifier(verifier);
    const appSession = await loginAppUser(publicClientId, brandedUserEmail, appUserPassword);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: publicClientId,
      redirect_uri: REDIRECT,
      scope: "openid profile email",
      state: "branding-state",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const res = await dispatchWeb(
      new Request(`http://localhost/oauth/authorize?${params.toString()}`, {
        headers: { cookie: `${APP_SESSION_COOKIE}=${encodeURIComponent(appSession)}` },
      }),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Branded OAuth App");
    expect(html).toContain("Sign in with OpenID Connect");
  });
});

run("OIDC discovery and tokens", () => {
  let clientId = "";
  let clientSecret = "";
  let appId = "";
  const appUserEmail = "oidc-user@example.com";

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
        body: { name: "OIDC App", redirectUris: [REDIRECT], clientType: "confidential" },
      }),
    );
    const created = (await appRes.json()) as {
      app: { id: string };
      credential: { clientId: string };
      clientSecret: string;
    };
    clientId = created.credential.clientId;
    clientSecret = created.clientSecret;
    appId = created.app.id;

    await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${created.app.id}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          email: appUserEmail,
          name: "OIDC User",
          password: appUserPassword,
          passwordConfirm: appUserPassword,
        },
      }),
    );
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("discovery document lists OIDC endpoints", async () => {
    const res = await dispatchWeb(new Request("http://localhost/.well-known/openid-configuration"));
    expect(res.status).toBe(200);
    const doc = (await res.json()) as Record<string, unknown>;
    expect(doc.issuer).toBe("http://localhost");
    expect(doc.authorization_endpoint).toBe("http://localhost/oauth/authorize");
    expect(doc.token_endpoint).toBe("http://localhost/oauth/token");
    expect(doc.userinfo_endpoint).toBe("http://localhost/oauth/userinfo");
    expect(doc.jwks_uri).toBe("http://localhost/.well-known/jwks.json");
    expect(doc.id_token_signing_alg_values_supported).toContain("RS256");
  });

  test("jwks returns public keys with kid", async () => {
    const res = await dispatchWeb(new Request("http://localhost/.well-known/jwks.json"));
    expect(res.status).toBe(200);
    const jwks = (await res.json()) as { keys: Array<{ kid?: string; kty?: string }> };
    expect(jwks.keys.length).toBeGreaterThan(0);
    expect(jwks.keys[0]?.kid).toBeTruthy();
    expect(jwks.keys[0]?.kty).toBe("RSA");
  });

  test("authorization_code exchange returns id_token when openid scope granted", async () => {
    const appSession = await loginAppUser(clientId, appUserEmail, appUserPassword);
    const code = await approveConsent({
      clientId,
      redirectUri: REDIRECT,
      appSession,
      scope: "openid profile email",
    });

    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(tokenRes.status).toBe(200);
    const token = (await tokenRes.json()) as { id_token?: string; access_token: string };
    expect(token.id_token).toBeTruthy();
    const parts = token.id_token!.split(".");
    expect(parts.length).toBe(3);
  });

  test("userinfo returns scope-gated claims", async () => {
    const appSession = await loginAppUser(clientId, appUserEmail, appUserPassword);
    const code = await approveConsent({
      clientId,
      redirectUri: REDIRECT,
      appSession,
      scope: "openid profile email",
    });

    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const token = (await tokenRes.json()) as { access_token: string };

    const userinfoRes = await dispatchWeb(
      new Request("http://localhost/oauth/userinfo", {
        headers: { authorization: `Bearer ${token.access_token}` },
      }),
    );
    expect(userinfoRes.status).toBe(200);
    const claims = (await userinfoRes.json()) as { sub: string; email?: string; name?: string };
    expect(claims.sub).toBeTruthy();
    expect(claims.email).toBe(appUserEmail);
    expect(claims.name).toBe("OIDC User");
  });

  test("userinfo rejects token without openid scope", async () => {
    const { csrf, cookie } = await ownerLogin();

    await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${appId}/scopes`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "read:only", description: "Read only" },
      }),
    );

    const appSession = await loginAppUser(clientId, appUserEmail, appUserPassword);
    const code = await approveConsent({
      clientId,
      redirectUri: REDIRECT,
      appSession,
      scope: "read:only",
    });

    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const token = (await tokenRes.json()) as { access_token: string };

    const userinfoRes = await dispatchWeb(
      new Request("http://localhost/oauth/userinfo", {
        headers: { authorization: `Bearer ${token.access_token}` },
      }),
    );
    expect(userinfoRes.status).toBe(403);
    const body = (await userinfoRes.json()) as { error: string };
    expect(body.error).toBe("insufficient_scope");
  });
});
