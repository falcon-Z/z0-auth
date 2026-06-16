import type { BunRequest } from "bun";

import { clientIdFromAuthorizePath, resolveAuthRealm } from "../../api/lib/auth-realm";
import { randomToken } from "../../api/lib/crypto";
import { withDatabaseErrorHandling } from "../../api/lib/database-errors";
import { resolveAppSession } from "../../api/lib/app-session";
import { loadConfig, requestPublicOrigin } from "../../api/lib/config";
import { validateFormCsrf } from "../../api/lib/csrf";
import { problem } from "../../api/lib/http";
import { clientIp, isRateLimited, recordRateLimitHit } from "../../api/lib/rate-limit";
import {
  exchangeAuthorizationCode,
  findOAuthAccessToken,
  findActiveOAuthClient,
  isAllowedRedirectUri,
  parseScopeSet,
  previewAuthorizationCodeForExchange,
  issueAuthorizationCode,
  revokeOAuthToken,
  validateRequestedScopes,
  verifyOAuthClientSecret,
} from "../../api/lib/oauth";
import { buildDiscoveryDocument, getJwks, hasOpenIdScope, issueIdToken } from "../../api/lib/oidc";
import { getDb } from "../../api/lib/db";
import { withSetCookie, preparePageCsrf } from "../csrf-page";
import { parseFormBody } from "../forms";
import { escapeHtml, renderAuthPage } from "../html";

const OAUTH_RETURN_COOKIE = "z0_oauth_return";
const OAUTH_CONSENT_COOKIE = "z0_oauth_consent";
const CONSENT_NONCE_TTL_MS = 10 * 60 * 1000;

const consumedConsentNonces = new Map<string, number>();

/** Clear consumed consent nonces between tests. */
export function resetConsumedConsentNoncesForTests(): void {
  consumedConsentNonces.clear();
}

function tryConsumeConsentNonce(nonce: string): boolean {
  const now = Date.now();
  for (const [key, expiresAt] of consumedConsentNonces) {
    if (expiresAt <= now) consumedConsentNonces.delete(key);
  }
  if (consumedConsentNonces.has(nonce)) return false;
  consumedConsentNonces.set(nonce, now + CONSENT_NONCE_TTL_MS);
  return true;
}

type ConsentState = {
  nonce: string;
  appUserId: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
};

function setReturnCookie(value: string): string {
  const secure = loadConfig().nodeEnv === "production";
  const parts = [
    `${OAUTH_RETURN_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearReturnCookie(): string {
  const secure = loadConfig().nodeEnv === "production";
  const parts = [`${OAUTH_RETURN_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function setConsentCookie(value: string): string {
  const secure = loadConfig().nodeEnv === "production";
  const parts = [
    `${OAUTH_CONSENT_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearConsentCookie(): string {
  const secure = loadConfig().nodeEnv === "production";
  const parts = [`${OAUTH_CONSENT_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function encodeConsentState(state: ConsentState): string {
  return JSON.stringify(state);
}

function decodeConsentState(raw: string | null): ConsentState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ConsentState;
    if (!parsed.nonce || !parsed.appUserId || !parsed.clientId || !parsed.redirectUri) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getCookie(req: Request, key: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === key) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function validateAuthorizeRequest(url: URL): Response | null {
  if (url.searchParams.get("response_type") !== "code") {
    return problem(400, "Bad Request", "response_type=code is required");
  }
  if (!url.searchParams.get("client_id")) {
    return problem(400, "Bad Request", "client_id is required");
  }
  if (!url.searchParams.get("redirect_uri")) {
    return problem(400, "Bad Request", "redirect_uri is required");
  }
  return null;
}

function oauthErrorResponse(status: number, error: string, description: string): Response {
  return Response.json(
    {
      error,
      error_description: description,
    },
    { status },
  );
}

const OAUTH_CLIENT_AUTH_RATE_LIMIT = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
} as const;

function oauthClientAuthRateLimitKey(req: Request, clientId: string): string {
  return `oauth-client-auth-fail:${clientIp(req)}:${clientId}`;
}

function oauthClientAuthRateLimitedResponse(req: Request, clientId: string): Response | null {
  const rate = isRateLimited({
    key: oauthClientAuthRateLimitKey(req, clientId),
    ...OAUTH_CLIENT_AUTH_RATE_LIMIT,
  });
  if (!rate.limited) return null;
  return oauthErrorResponse(429, "invalid_client", "client authentication rate limit exceeded");
}

function recordOAuthClientAuthFailure(req: Request, clientId: string): void {
  recordRateLimitHit({
    key: oauthClientAuthRateLimitKey(req, clientId),
    ...OAUTH_CLIENT_AUTH_RATE_LIMIT,
  });
}

async function redirectWithCode(url: URL, appId: string, appUserId: string): Promise<Response> {
  const redirectUri = url.searchParams.get("redirect_uri")!;
  const state = url.searchParams.get("state");
  const scope = (url.searchParams.get("scope") ?? "").trim().replace(/\s+/g, " ");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  const clientId = url.searchParams.get("client_id")!;
  const client = await findActiveOAuthClient(clientId);
  if (!client) return problem(400, "Bad Request", "Unknown client_id");

  const code = await issueAuthorizationCode({
    appId,
    appUserId,
    appCredentialId: client.credentialId,
    redirectUri,
    scope,
    codeChallenge,
    codeChallengeMethod,
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  const headers = new Headers({ Location: redirect.toString() });
  headers.append("Set-Cookie", clearReturnCookie());
  return new Response(null, { status: 302, headers });
}

function renderConsentPage(req: BunRequest, params: {
  appUserId: string;
  clientId: string;
  redirectUri: string;
  state: string | null;
  scope: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}): Response {
  const csrf = preparePageCsrf(req);
  const consentNonce = randomToken(16);
  const consentState: ConsentState = {
    nonce: consentNonce,
    appUserId: params.appUserId,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    scope: params.scope,
    state: params.state,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
  };
  const body = `<form method="post" action="/oauth/authorize" class="auth-card">
      <h2>Authorize application</h2>
      <p class="auth-lead">This app is requesting access to your account.</p>
      <p><strong>Requested scope:</strong> <code>${escapeHtml(params.scope || "(none)")}</code></p>
      <input type="hidden" name="_csrf" value="${escapeHtml(csrf.token)}" />
      <input type="hidden" name="response_type" value="code" />
      <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
      <input type="hidden" name="scope" value="${escapeHtml(params.scope)}" />
      <input type="hidden" name="state" value="${escapeHtml(params.state ?? "")}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge ?? "")}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod ?? "")}" />
      <input type="hidden" name="consent_nonce" value="${escapeHtml(consentNonce)}" />
      <div class="auth-actions">
        <button type="submit" name="consent" value="deny" class="auth-button auth-button--secondary">Cancel</button>
        <button type="submit" name="consent" value="approve" class="auth-button">Allow and continue</button>
      </div>
    </form>`;
  const response = withSetCookie(
    new Response(
      renderAuthPage({
        title: "Authorize access",
        description: "Review requested access before continuing.",
        csrfToken: csrf.token,
        body,
      }),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    ),
    csrf.setCookie,
  );
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", setConsentCookie(encodeConsentState(consentState)));
  return new Response(response.body, { status: response.status, headers });
}

function loginRedirectForAuthorize(req: BunRequest, authorizePath: string): Response {
  const clientId = clientIdFromAuthorizePath(authorizePath);
  const params = new URLSearchParams({
    return_to: authorizePath,
  });
  if (clientId) params.set("client_id", clientId);

  const headers = new Headers({
    Location: `/auth/login?${params.toString()}`,
  });
  headers.append("Set-Cookie", setReturnCookie(authorizePath));
  return new Response(null, { status: 302, headers });
}

async function getAuthorize(req: BunRequest): Promise<Response> {
  const url = new URL(req.url);
  const invalid = validateAuthorizeRequest(url);
  if (invalid) return invalid;

  const clientId = url.searchParams.get("client_id")!;
  const client = await findActiveOAuthClient(clientId);
  if (!client) {
    return problem(400, "Bad Request", "Unknown client_id", { code: "invalid_client" });
  }
  if (!isAllowedRedirectUri(client, url.searchParams.get("redirect_uri")!)) {
    return problem(400, "Bad Request", "redirect_uri must exactly match a registered URI", {
      code: "invalid_redirect_uri",
    });
  }
  const normalizedScopeResult = await validateRequestedScopes(client.appId, url.searchParams.get("scope") ?? "");
  if (!normalizedScopeResult.ok) {
    return problem(400, "Bad Request", "Requested scope is not allowed for this app", {
      code: "invalid_scope",
    });
  }
  const challenge = url.searchParams.get("code_challenge")?.trim() ?? "";
  const challengeMethod = url.searchParams.get("code_challenge_method");
  if (client.clientType === "public" && (!challenge || challengeMethod !== "S256")) {
    return problem(400, "Bad Request", "Public clients require PKCE (S256)", {
      code: "pkce_required",
    });
  }
  if (challenge && challengeMethod !== "S256") {
    return problem(400, "Bad Request", "code_challenge_method must be S256 when code_challenge is provided", {
      code: "pkce_required",
    });
  }

  const appSession = await resolveAppSession(req);
  if (!appSession || appSession.appId !== client.appId) {
    return loginRedirectForAuthorize(req, `${url.pathname}${url.search}`);
  }

  return renderConsentPage(req, {
    appUserId: appSession.appUserId,
    clientId,
    redirectUri: url.searchParams.get("redirect_uri")!,
    state: url.searchParams.get("state"),
    scope: normalizedScopeResult.normalizedScope,
    codeChallenge: url.searchParams.get("code_challenge")?.trim() ?? null,
    codeChallengeMethod: url.searchParams.get("code_challenge_method"),
  });
}

async function getResume(req: BunRequest): Promise<Response> {
  const pending = getCookie(req, OAUTH_RETURN_COOKIE);
  if (!pending) {
    return Response.redirect(new URL("/", req.url), 302);
  }

  const realm = await resolveAuthRealm(req, { returnTo: pending });
  if (realm.mode === "app") {
    const appSession = await resolveAppSession(req);
    if (!appSession || appSession.appId !== realm.appId) {
      return loginRedirectForAuthorize(req, pending);
    }
  }

  return Response.redirect(new URL(pending, req.url), 302);
}

async function postToken(req: BunRequest): Promise<Response> {
  const body = await parseFormBody(req);
  if (body.grant_type !== "authorization_code") {
    return oauthErrorResponse(400, "unsupported_grant_type", "grant_type must be authorization_code");
  }
  if (!body.code || !body.redirect_uri || !body.client_id) {
    return oauthErrorResponse(400, "invalid_request", "code, redirect_uri, and client_id are required");
  }
  const authRateLimited = oauthClientAuthRateLimitedResponse(req, body.client_id);
  if (authRateLimited) return authRateLimited;

  const client = await findActiveOAuthClient(body.client_id);
  if (!client) {
    recordOAuthClientAuthFailure(req, body.client_id);
    return oauthErrorResponse(401, "invalid_client", "client authentication failed");
  }
  const clientAuthOk = await verifyOAuthClientSecret(client, body.client_secret);
  if (!clientAuthOk) {
    recordOAuthClientAuthFailure(req, body.client_id);
    return oauthErrorResponse(401, "invalid_client", "client authentication failed");
  }

  const preview = await previewAuthorizationCodeForExchange({
    code: body.code,
    client,
    redirectUri: body.redirect_uri,
    codeVerifier: body.code_verifier,
  });
  if (!preview.ok) {
    return oauthErrorResponse(400, "invalid_grant", "authorization code is invalid, expired, or already used");
  }

  let idToken: string | null = null;
  if (hasOpenIdScope(preview.preview.scope)) {
    const [appUserRow] = await getDb()`
      SELECT id, email, name, email_verified_at
      FROM app_users
      WHERE id = ${preview.preview.appUserId}
        AND status = 'active'
      LIMIT 1
    `;
    if (!appUserRow) {
      return oauthErrorResponse(400, "invalid_grant", "authorization code is invalid, expired, or already used");
    }
    const appUser = appUserRow as {
      id: string;
      email: string | null;
      name: string | null;
      email_verified_at: Date | null;
    };
    idToken = await issueIdToken({
      issuer: requestPublicOrigin(req),
      audience: body.client_id,
      subject: appUser.id,
      email: appUser.email,
      emailVerified: Boolean(appUser.email_verified_at),
      name: appUser.name,
      grantedScope: preview.preview.scope,
      expiresInSeconds: 60 * 60,
    });
  }

  const exchanged = await exchangeAuthorizationCode({
    code: body.code,
    client,
    redirectUri: body.redirect_uri,
    codeVerifier: body.code_verifier,
  });
  if (!exchanged.ok) {
    return oauthErrorResponse(400, "invalid_grant", "authorization code is invalid, expired, or already used");
  }

  const payload: Record<string, unknown> = {
    access_token: exchanged.accessToken,
    token_type: exchanged.tokenType,
    expires_in: exchanged.expiresIn,
    scope: exchanged.scope,
  };

  if (idToken) {
    payload.id_token = idToken;
  }

  return Response.json(payload);
}

async function postAuthorize(req: BunRequest): Promise<Response> {
  const body = await parseFormBody(req);
  const csrfError = validateFormCsrf(req, body._csrf);
  if (csrfError) return csrfError;
  if (body.response_type !== "code" || !body.client_id || !body.redirect_uri) {
    return problem(400, "Bad Request", "Invalid authorize request");
  }
  const consentState = decodeConsentState(getCookie(req, OAUTH_CONSENT_COOKIE));
  if (!consentState || !body.consent_nonce || consentState.nonce !== body.consent_nonce) {
    return problem(400, "Bad Request", "Consent confirmation is required");
  }
  if (
    consentState.clientId !== body.client_id ||
    consentState.redirectUri !== body.redirect_uri ||
    consentState.scope !== (body.scope ?? "") ||
    (consentState.state ?? "") !== (body.state ?? "") ||
    (consentState.codeChallenge ?? "") !== (body.code_challenge ?? "") ||
    (consentState.codeChallengeMethod ?? "") !== (body.code_challenge_method ?? "")
  ) {
    return problem(400, "Bad Request", "Consent approval does not match the reviewed authorize request");
  }

  const client = await findActiveOAuthClient(body.client_id);
  if (!client) return problem(400, "Bad Request", "Unknown client_id");
  if (!isAllowedRedirectUri(client, body.redirect_uri)) {
    return problem(400, "Bad Request", "redirect_uri must exactly match a registered URI");
  }

  if (body.consent !== "approve") {
    if (!tryConsumeConsentNonce(consentState.nonce)) {
      return problem(400, "Bad Request", "Consent confirmation has already been used");
    }
    const denied = new URL(body.redirect_uri);
    denied.searchParams.set("error", "access_denied");
    if (body.state) denied.searchParams.set("state", body.state);
    const headers = new Headers({ Location: denied.toString() });
    headers.append("Set-Cookie", clearConsentCookie());
    return new Response(null, { status: 302, headers });
  }

  const normalizedScopeResult = await validateRequestedScopes(client.appId, consentState.scope);
  if (!normalizedScopeResult.ok) {
    return problem(400, "Bad Request", "Requested scope is not allowed for this app");
  }
  if (
    client.clientType === "public" &&
    (!consentState.codeChallenge || consentState.codeChallengeMethod !== "S256")
  ) {
    return problem(400, "Bad Request", "Public clients require PKCE (S256)");
  }

  const appSession = await resolveAppSession(req);
  if (!appSession || appSession.appId !== client.appId) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: body.client_id,
      redirect_uri: body.redirect_uri,
    });
    if (consentState.state) params.set("state", consentState.state);
    if (normalizedScopeResult.normalizedScope) params.set("scope", normalizedScopeResult.normalizedScope);
    if (consentState.codeChallenge) params.set("code_challenge", consentState.codeChallenge);
    if (consentState.codeChallengeMethod) params.set("code_challenge_method", consentState.codeChallengeMethod);
    return loginRedirectForAuthorize(req, `/oauth/authorize?${params.toString()}`);
  }
  if (appSession.appUserId !== consentState.appUserId) {
    return problem(400, "Bad Request", "Consent approval is no longer valid for this session");
  }

  if (!tryConsumeConsentNonce(consentState.nonce)) {
    return problem(400, "Bad Request", "Consent confirmation has already been used");
  }

  const authorizeUrl = new URL("http://localhost/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", body.client_id);
  authorizeUrl.searchParams.set("redirect_uri", body.redirect_uri);
  authorizeUrl.searchParams.set("scope", normalizedScopeResult.normalizedScope);
  if (consentState.codeChallenge) authorizeUrl.searchParams.set("code_challenge", consentState.codeChallenge);
  if (consentState.codeChallengeMethod) {
    authorizeUrl.searchParams.set("code_challenge_method", consentState.codeChallengeMethod);
  }
  if (consentState.state) authorizeUrl.searchParams.set("state", consentState.state);
  const response = await redirectWithCode(authorizeUrl, client.appId, appSession.appUserId);
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", clearConsentCookie());
  return new Response(response.body, { status: response.status, headers });
}

async function postRevoke(req: BunRequest): Promise<Response> {
  const body = await parseFormBody(req);
  if (!body.token || !body.client_id) {
    return oauthErrorResponse(400, "invalid_request", "token and client_id are required");
  }
  const authRateLimited = oauthClientAuthRateLimitedResponse(req, body.client_id);
  if (authRateLimited) return authRateLimited;

  const client = await findActiveOAuthClient(body.client_id);
  if (!client) {
    recordOAuthClientAuthFailure(req, body.client_id);
    return oauthErrorResponse(401, "invalid_client", "client authentication failed");
  }
  const clientAuthOk = await verifyOAuthClientSecret(client, body.client_secret);
  if (!clientAuthOk) {
    recordOAuthClientAuthFailure(req, body.client_id);
    return oauthErrorResponse(401, "invalid_client", "client authentication failed");
  }

  await revokeOAuthToken({ token: body.token, client });
  return new Response(null, { status: 200 });
}

async function getOpenIdConfiguration(req: BunRequest): Promise<Response> {
  const issuer = requestPublicOrigin(req);
  return Response.json(buildDiscoveryDocument({ issuer }));
}

async function getJwksRoute(): Promise<Response> {
  return Response.json(await getJwks());
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

async function getUserinfo(req: BunRequest): Promise<Response> {
  const token = bearerToken(req);
  if (!token) {
    return oauthErrorResponse(401, "invalid_token", "access token is required");
  }
  const accessToken = await findOAuthAccessToken(token);
  if (!accessToken || accessToken.revokedAt || new Date(accessToken.expiresAt).getTime() <= Date.now()) {
    return oauthErrorResponse(401, "invalid_token", "access token is invalid or expired");
  }

  const scopes = parseScopeSet(accessToken.scope);
  if (!scopes.has("openid")) {
    return oauthErrorResponse(403, "insufficient_scope", "token does not grant required scope");
  }

  const [appUserRow] = await getDb()`
    SELECT id, email, name, email_verified_at
    FROM app_users
    WHERE id = ${accessToken.appUserId}
      AND status = 'active'
    LIMIT 1
  `;
  if (!appUserRow) {
    return oauthErrorResponse(401, "invalid_token", "access token subject is invalid");
  }
  const appUser = appUserRow as {
    id: string;
    email: string | null;
    name: string | null;
    email_verified_at: Date | null;
  };

  const claims: Record<string, unknown> = { sub: appUser.id };
  if (scopes.has("email") && appUser.email) {
    claims.email = appUser.email;
    claims.email_verified = Boolean(appUser.email_verified_at);
  }
  if (scopes.has("profile") && appUser.name) {
    claims.name = appUser.name;
  }

  return Response.json(claims);
}

export const oauthWebRoutes = {
  "/oauth/authorize": {
    GET: withDatabaseErrorHandling(getAuthorize),
    POST: withDatabaseErrorHandling(postAuthorize),
  },
  "/oauth/token": {
    POST: withDatabaseErrorHandling(postToken),
  },
  "/oauth/revoke": {
    POST: withDatabaseErrorHandling(postRevoke),
  },
  "/.well-known/openid-configuration": {
    GET: withDatabaseErrorHandling(getOpenIdConfiguration),
  },
  "/.well-known/jwks.json": {
    GET: withDatabaseErrorHandling(getJwksRoute),
  },
  "/oauth/userinfo": {
    GET: withDatabaseErrorHandling(getUserinfo),
  },
  "/oauth/resume": {
    GET: getResume,
  },
} as const;
