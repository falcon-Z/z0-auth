import type { BunRequest } from "bun";
import { safeDecodeURIComponent } from "@z0/contracts/validation";

import { clientIdFromAuthorizePath, resolveAuthRealm } from "../../api/lib/auth-realm";
import { randomToken } from "../../api/lib/crypto";
import { withDatabaseErrorHandling } from "../../api/lib/database-errors";
import { resolveAppSession } from "../../api/lib/app-session";
import {
  appendSetCookie,
  getGroupMemberIdForAppUser,
  groupSsoCoversScope,
  resolveTargetAppSession,
} from "../../api/lib/group-sso";
import { loadConfig, requestPublicOrigin } from "../../api/lib/config";
import { validateFormCsrf } from "../../api/lib/csrf";
import { problem } from "../../api/lib/http";
import { clientIp, isRateLimited, recordRateLimitHit } from "../../api/lib/rate-limit";
import {
  buildOAuthCorsHeaders,
  isOAuthCorsOriginAllowed,
  isOriginAllowedForClient,
  withOAuthCors,
} from "../../api/lib/oauth-cors";
import {
  getOAuthConsentPageContext,
  getOAuthUserConsent,
  scopeIsSubset,
  upsertOAuthUserConsent,
} from "../../api/lib/oauth-consent";
import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  findOAuthAccessToken,
  findActiveOAuthClient,
  isAllowedRedirectUri,
  issueClientCredentialsToken,
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
  oidcNonce: string | null;
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
    if (k === key) return safeDecodeURIComponent(rest.join("="));
  }
  return null;
}

function validateAuthorizeRequest(url: URL): Response | null {
  if (!url.searchParams.get("client_id")) {
    return problem(400, "Bad Request", "client_id is required");
  }
  if (!url.searchParams.get("redirect_uri")) {
    return problem(400, "Bad Request", "redirect_uri is required");
  }
  return null;
}

function authorizeErrorRedirect(
  url: URL,
  error: string,
  description: string,
): Response {
  const redirect = new URL(url.searchParams.get("redirect_uri")!);
  redirect.searchParams.set("error", error);
  redirect.searchParams.set("error_description", description);
  const state = url.searchParams.get("state");
  if (state) redirect.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { Location: redirect.toString() } });
}

function oauthErrorResponse(status: number, error: string, description: string): Response {
  const response = Response.json(
    {
      error,
      error_description: description,
    },
    { status },
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  if (status === 401) response.headers.set("WWW-Authenticate", 'Basic realm="oauth"');
  return response;
}

function oauthClientCredentials(
  req: Request,
  body: Record<string, string>,
): { clientId: string; clientSecret: string | undefined } | Response {
  const authorization = req.headers.get("authorization");
  if (!authorization) {
    if (!body.client_id) return oauthErrorResponse(400, "invalid_request", "client_id is required");
    return { clientId: body.client_id, clientSecret: body.client_secret };
  }

  const [scheme, encoded] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "basic" || !encoded) {
    return oauthErrorResponse(401, "invalid_client", "client authentication failed");
  }
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return oauthErrorResponse(401, "invalid_client", "client authentication failed");
  }
  const separator = decoded.indexOf(":");
  if (separator < 1) return oauthErrorResponse(401, "invalid_client", "client authentication failed");
  const clientId = safeDecodeURIComponent(decoded.slice(0, separator));
  const clientSecret = safeDecodeURIComponent(decoded.slice(separator + 1));
  if (clientId === null || clientSecret === null) {
    return oauthErrorResponse(401, "invalid_client", "client authentication failed");
  }
  if (body.client_id && body.client_id !== clientId) {
    return oauthErrorResponse(400, "invalid_request", "conflicting client credentials");
  }
  return { clientId, clientSecret };
}

const OAUTH_CLIENT_AUTH_RATE_LIMIT = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
} as const;

function oauthClientAuthRateLimitKey(req: Request, clientId: string): string {
  return `oauth-client-auth-fail:${clientIp(req)}:${clientId}`;
}

async function oauthClientAuthRateLimitedResponse(req: Request, clientId: string): Promise<Response | null> {
  const rate = await isRateLimited({
    key: oauthClientAuthRateLimitKey(req, clientId),
    ...OAUTH_CLIENT_AUTH_RATE_LIMIT,
  });
  if (!rate.limited) return null;
  return oauthErrorResponse(429, "invalid_client", "client authentication rate limit exceeded");
}

async function recordOAuthClientAuthFailure(req: Request, clientId: string): Promise<void> {
  await recordRateLimitHit({
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
    nonce: url.searchParams.get("nonce"),
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  const headers = new Headers({ Location: redirect.toString() });
  headers.append("Set-Cookie", clearReturnCookie());
  return new Response(null, { status: 302, headers });
}

function renderScopeList(scopes: Array<{ name: string; description: string | null }>): string {
  if (scopes.length === 0) {
    return `<p class="auth-lead">This app wants to sign you in.</p>`;
  }
  const items = scopes
    .map((scope) => {
      const label = scope.description?.trim() || scope.name;
      return `<li>${escapeHtml(label)}</li>`;
    })
    .join("");
  return `<p class="auth-lead">This app is requesting the following access:</p>
      <ul class="auth-scope-list">${items}</ul>`;
}

async function renderConsentPage(req: BunRequest, params: {
  appId: string;
  appUserId: string;
  clientId: string;
  redirectUri: string;
  state: string | null;
  scope: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  oidcNonce: string | null;
}): Promise<Response> {
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
    oidcNonce: params.oidcNonce,
  };
  const context = await getOAuthConsentPageContext(params.appId, params.scope);
  const body = `<form method="post" action="/oauth/authorize" class="auth-card">
      <h2>Authorize ${escapeHtml(context.appName)}</h2>
      ${renderScopeList(context.scopes)}
      <input type="hidden" name="_csrf" value="${escapeHtml(csrf.token)}" />
      <input type="hidden" name="response_type" value="code" />
      <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
      <input type="hidden" name="scope" value="${escapeHtml(params.scope)}" />
      <input type="hidden" name="state" value="${escapeHtml(params.state ?? "")}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge ?? "")}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod ?? "")}" />
      <input type="hidden" name="nonce" value="${escapeHtml(params.oidcNonce ?? "")}" />
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
        description: `Review what ${context.appName} can access before continuing.`,
        csrfToken: csrf.token,
        body,
        branding: context.branding,
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
  if (url.searchParams.get("response_type") !== "code") {
    return authorizeErrorRedirect(url, "unsupported_response_type", "response_type=code is required");
  }
  const normalizedScopeResult = await validateRequestedScopes(client.appId, url.searchParams.get("scope") ?? "");
  if (!normalizedScopeResult.ok) {
    return authorizeErrorRedirect(url, "invalid_scope", "Requested scope is not allowed for this app");
  }
  if (client.clientType === "public" && (!url.searchParams.get("state")?.trim())) {
    return authorizeErrorRedirect(url, "invalid_request", "state is required for public clients");
  }
  const challenge = url.searchParams.get("code_challenge")?.trim() ?? "";
  const challengeMethod = url.searchParams.get("code_challenge_method");
  if (client.clientType === "public" && (!challenge || challengeMethod !== "S256")) {
    return authorizeErrorRedirect(url, "invalid_request", "Public clients require PKCE (S256)");
  }
  if (challenge && challengeMethod !== "S256") {
    return authorizeErrorRedirect(
      url,
      "invalid_request",
      "code_challenge_method must be S256 when code_challenge is provided",
    );
  }

  const resolved = await resolveTargetAppSession(req, client.appId);
  if (!resolved) {
    return loginRedirectForAuthorize(req, `${url.pathname}${url.search}`);
  }

  const appSession = resolved.session;

  const storedConsent = await getOAuthUserConsent(appSession.appUserId, client.appId);
  const groupMemberId = await getGroupMemberIdForAppUser(appSession.appUserId);
  const groupCoversScope =
    groupMemberId !== null &&
    (await groupSsoCoversScope(groupMemberId, normalizedScopeResult.normalizedScope));

  if (
    (storedConsent && scopeIsSubset(normalizedScopeResult.normalizedScope, storedConsent.scope)) ||
    groupCoversScope
  ) {
    const redirect = await redirectWithCode(url, client.appId, appSession.appUserId);
    appendSetCookie(redirect.headers, resolved.setCookie);
    return redirect;
  }

  const consentResponse = await renderConsentPage(req, {
    appId: client.appId,
    appUserId: appSession.appUserId,
    clientId,
    redirectUri: url.searchParams.get("redirect_uri")!,
    state: url.searchParams.get("state"),
    scope: normalizedScopeResult.normalizedScope,
    codeChallenge: url.searchParams.get("code_challenge")?.trim() ?? null,
    codeChallengeMethod: url.searchParams.get("code_challenge_method"),
    oidcNonce: url.searchParams.get("nonce"),
  });
  appendSetCookie(consentResponse.headers, resolved.setCookie);
  return consentResponse;
}

async function getResume(req: BunRequest): Promise<Response> {
  const pending = getCookie(req, OAUTH_RETURN_COOKIE);
  if (!pending) {
    return Response.redirect(new URL("/", req.url), 302);
  }

  const realm = await resolveAuthRealm(req, { returnTo: pending });
  if (realm.mode === "app") {
    const resolved = await resolveTargetAppSession(req, realm.appId);
    if (!resolved) {
      return loginRedirectForAuthorize(req, pending);
    }
    const redirect = Response.redirect(new URL(pending, req.url), 302);
    appendSetCookie(redirect.headers, resolved.setCookie);
    return redirect;
  }

  return Response.redirect(new URL(pending, req.url), 302);
}

async function oauthCorsPreflight(req: BunRequest): Promise<Response> {
  const origin = req.headers.get("Origin");
  const allowed = await isOAuthCorsOriginAllowed(origin);
  if (!allowed) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: buildOAuthCorsHeaders(origin) });
}

async function authenticateOAuthClient(
  req: BunRequest,
  clientId: string,
  clientSecret: string | undefined,
): Promise<{ client: NonNullable<Awaited<ReturnType<typeof findActiveOAuthClient>>> } | Response> {
  const authRateLimited = await oauthClientAuthRateLimitedResponse(req, clientId);
  if (authRateLimited) return authRateLimited;

  const client = await findActiveOAuthClient(clientId);
  if (!client) {
    await recordOAuthClientAuthFailure(req, clientId);
    return oauthErrorResponse(401, "invalid_client", "client authentication failed");
  }
  const clientAuthOk = await verifyOAuthClientSecret(client, clientSecret);
  if (!clientAuthOk) {
    await recordOAuthClientAuthFailure(req, clientId);
    return oauthErrorResponse(401, "invalid_client", "client authentication failed");
  }
  return { client };
}

function jsonOAuthResponse(
  req: BunRequest,
  payload: Record<string, unknown>,
  client: { redirectUris: string[] },
  status = 200,
): Response {
  const origin = req.headers.get("Origin");
  const allowed = isOriginAllowedForClient(origin, client.redirectUris);
  const response = Response.json(payload, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  return withOAuthCors(response, origin, allowed);
}

function oauthErrorResponseWithCors(
  req: BunRequest,
  client: { redirectUris: string[] } | null,
  status: number,
  error: string,
  description: string,
): Response {
  const origin = req.headers.get("Origin");
  const allowed = client ? isOriginAllowedForClient(origin, client.redirectUris) : false;
  return withOAuthCors(oauthErrorResponse(status, error, description), origin, allowed);
}

async function postToken(req: BunRequest): Promise<Response> {
  const body = await parseFormBody(req);
  if (!body.grant_type) {
    return oauthErrorResponse(400, "invalid_request", "grant_type is required");
  }

  const credentials = oauthClientCredentials(req, body);
  if (credentials instanceof Response) return credentials;
  const auth = await authenticateOAuthClient(req, credentials.clientId, credentials.clientSecret);
  if (auth instanceof Response) return auth;
  const { client } = auth;

  if (body.grant_type === "authorization_code") {
    if (!body.code || !body.redirect_uri) {
      return oauthErrorResponseWithCors(req, client, 400, "invalid_request", "code and redirect_uri are required");
    }

    const preview = await previewAuthorizationCodeForExchange({
      code: body.code,
      client,
      redirectUri: body.redirect_uri,
      codeVerifier: body.code_verifier,
    });
    if (!preview.ok) {
      return oauthErrorResponseWithCors(
        req,
        client,
        400,
        "invalid_grant",
        "authorization code is invalid, expired, or already used",
      );
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
        return oauthErrorResponseWithCors(
          req,
          client,
          400,
          "invalid_grant",
          "authorization code is invalid, expired, or already used",
        );
      }
      const appUser = appUserRow as {
        id: string;
        email: string | null;
        name: string | null;
        email_verified_at: Date | null;
      };
      idToken = await issueIdToken({
        issuer: requestPublicOrigin(req),
        audience: credentials.clientId,
        subject: appUser.id,
        email: appUser.email,
        emailVerified: Boolean(appUser.email_verified_at),
        name: appUser.name,
        grantedScope: preview.preview.scope,
        nonce: preview.preview.nonce,
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
      return oauthErrorResponseWithCors(
        req,
        client,
        400,
        "invalid_grant",
        "authorization code is invalid, expired, or already used",
      );
    }

    const payload: Record<string, unknown> = {
      access_token: exchanged.accessToken,
      token_type: exchanged.tokenType,
      expires_in: exchanged.expiresIn,
      scope: exchanged.scope,
      refresh_token: exchanged.refreshToken,
    };
    if (idToken) payload.id_token = idToken;
    return jsonOAuthResponse(req, payload, client);
  }

  if (body.grant_type === "refresh_token") {
    if (!body.refresh_token) {
      return oauthErrorResponseWithCors(req, client, 400, "invalid_request", "refresh_token is required");
    }
    const refreshed = await exchangeRefreshToken({ refreshToken: body.refresh_token, client });
    if (!refreshed.ok) {
      return oauthErrorResponseWithCors(req, client, 400, "invalid_grant", "refresh token is invalid or expired");
    }
    return jsonOAuthResponse(req, {
      access_token: refreshed.accessToken,
      token_type: refreshed.tokenType,
      expires_in: refreshed.expiresIn,
      scope: refreshed.scope,
      refresh_token: refreshed.refreshToken,
    }, client);
  }

  if (body.grant_type === "client_credentials") {
    const issued = await issueClientCredentialsToken({ client, scope: body.scope ?? "" });
    if (!issued.ok) {
      if (issued.error === "unauthorized_client") {
        return oauthErrorResponseWithCors(req, client, 400, "unauthorized_client", "client is not allowed to use this grant");
      }
      return oauthErrorResponseWithCors(req, client, 400, "invalid_scope", "requested scope is not allowed for this app");
    }
    return jsonOAuthResponse(req, {
      access_token: issued.accessToken,
      token_type: issued.tokenType,
      expires_in: issued.expiresIn,
      scope: issued.scope,
    }, client);
  }

  return oauthErrorResponseWithCors(req, client, 400, "unsupported_grant_type", "grant_type is not supported");
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
    || (consentState.oidcNonce ?? "") !== (body.nonce ?? "")
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

  const resolved = await resolveTargetAppSession(req, client.appId);
  if (!resolved) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: body.client_id,
      redirect_uri: body.redirect_uri,
    });
    if (consentState.state) params.set("state", consentState.state);
    if (normalizedScopeResult.normalizedScope) params.set("scope", normalizedScopeResult.normalizedScope);
    if (consentState.codeChallenge) params.set("code_challenge", consentState.codeChallenge);
    if (consentState.codeChallengeMethod) params.set("code_challenge_method", consentState.codeChallengeMethod);
    if (consentState.oidcNonce) params.set("nonce", consentState.oidcNonce);
    return loginRedirectForAuthorize(req, `/oauth/authorize?${params.toString()}`);
  }
  const appSession = resolved.session;
  if (appSession.appUserId !== consentState.appUserId) {
    return problem(400, "Bad Request", "Consent approval is no longer valid for this session");
  }

  if (!tryConsumeConsentNonce(consentState.nonce)) {
    return problem(400, "Bad Request", "Consent confirmation has already been used");
  }

  await upsertOAuthUserConsent({
    appUserId: appSession.appUserId,
    appId: client.appId,
    requestedScope: normalizedScopeResult.normalizedScope,
  });

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
  if (consentState.oidcNonce) authorizeUrl.searchParams.set("nonce", consentState.oidcNonce);
  const response = await redirectWithCode(authorizeUrl, client.appId, appSession.appUserId);
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", clearConsentCookie());
  appendSetCookie(headers, resolved.setCookie);
  return new Response(response.body, { status: response.status, headers });
}

async function postRevoke(req: BunRequest): Promise<Response> {
  const body = await parseFormBody(req);
  if (!body.token) {
    return oauthErrorResponse(400, "invalid_request", "token is required");
  }
  const credentials = oauthClientCredentials(req, body);
  if (credentials instanceof Response) return credentials;
  const auth = await authenticateOAuthClient(req, credentials.clientId, credentials.clientSecret);
  if (auth instanceof Response) return auth;

  await revokeOAuthToken({ token: body.token, client: auth.client });
  return new Response(null, { status: 200 });
}

async function postIntrospect(req: BunRequest): Promise<Response> {
  const body = await parseFormBody(req);
  if (!body.token) return oauthErrorResponse(400, "invalid_request", "token is required");

  const credentials = oauthClientCredentials(req, body);
  if (credentials instanceof Response) return credentials;
  const auth = await authenticateOAuthClient(req, credentials.clientId, credentials.clientSecret);
  if (auth instanceof Response) return auth;

  const token = await findOAuthAccessToken(body.token);
  const active = Boolean(
    token &&
      token.appId === auth.client.appId &&
      !token.revokedAt &&
      new Date(token.expiresAt).getTime() > Date.now(),
  );
  if (!active || !token) {
    return jsonOAuthResponse(req, { active: false }, auth.client);
  }

  return jsonOAuthResponse(req, {
    active: true,
    client_id: auth.client.clientId,
    token_type: "Bearer",
    scope: token.scope,
    exp: Math.floor(new Date(token.expiresAt).getTime() / 1000),
    sub: token.appUserId ?? auth.client.clientId,
    aud: token.appId,
  }, auth.client);
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
  const origin = req.headers.get("Origin");
  const token = bearerToken(req);
  if (!token) {
    const res = oauthErrorResponse(401, "invalid_token", "access token is required");
    const allowed = await isOAuthCorsOriginAllowed(origin);
    return withOAuthCors(res, origin, allowed);
  }
  const accessToken = await findOAuthAccessToken(token);
  if (!accessToken || accessToken.revokedAt || new Date(accessToken.expiresAt).getTime() <= Date.now()) {
    const res = oauthErrorResponse(401, "invalid_token", "access token is invalid or expired");
    const allowed = await isOAuthCorsOriginAllowed(origin);
    return withOAuthCors(res, origin, allowed);
  }

  if (!accessToken.appUserId) {
    const res = oauthErrorResponse(401, "invalid_token", "access token subject is invalid");
    const allowed = await isOAuthCorsOriginAllowed(origin);
    return withOAuthCors(res, origin, allowed);
  }

  const scopes = parseScopeSet(accessToken.scope);
  if (!scopes.has("openid")) {
    const res = oauthErrorResponse(403, "insufficient_scope", "token does not grant required scope");
    const allowed = await isOAuthCorsOriginAllowed(origin);
    return withOAuthCors(res, origin, allowed);
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

  const allowed = await isOAuthCorsOriginAllowed(origin);
  return withOAuthCors(Response.json(claims), origin, allowed);
}

export const oauthWebRoutes = {
  "/oauth/authorize": {
    GET: withDatabaseErrorHandling(getAuthorize),
    POST: withDatabaseErrorHandling(postAuthorize),
  },
  "/oauth/token": {
    OPTIONS: withDatabaseErrorHandling(oauthCorsPreflight),
    POST: withDatabaseErrorHandling(postToken),
  },
  "/oauth/revoke": {
    POST: withDatabaseErrorHandling(postRevoke),
  },
  "/oauth/introspect": {
    POST: withDatabaseErrorHandling(postIntrospect),
  },
  "/.well-known/openid-configuration": {
    GET: withDatabaseErrorHandling(getOpenIdConfiguration),
  },
  "/.well-known/jwks.json": {
    GET: withDatabaseErrorHandling(getJwksRoute),
  },
  "/oauth/userinfo": {
    OPTIONS: withDatabaseErrorHandling(oauthCorsPreflight),
    GET: withDatabaseErrorHandling(getUserinfo),
  },
  "/oauth/resume": {
    GET: getResume,
  },
} as const;
