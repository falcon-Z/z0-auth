import { generateAppleClientSecret, decodeJwtPayload, parseAppleMetadata } from "./federation-apple";
import type { NormalizedIdpProfile } from "./federation-linking";
import { loadConfig, requestPublicOrigin } from "./config";
import { getDb } from "./db";
import { getProviderSecrets, callbackUrlForKey, type ProviderSecrets } from "./federation-providers";
import { randomToken } from "./crypto";

export const FEDERATION_STATE_COOKIE = "z0_federation_state";
const STATE_TTL_MS = 10 * 60 * 1000;

export type FederationState = {
  nonce: string;
  providerKey: string;
  providerId: string;
  appId: string;
  clientId: string;
  returnTo: string | null;
  createdAt: number;
};

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
};

export function encodeFederationState(state: FederationState): string {
  return JSON.stringify(state);
}

export function decodeFederationState(raw: string | null): FederationState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FederationState;
    if (!parsed.nonce || !parsed.providerKey || !parsed.providerId || !parsed.appId || !parsed.clientId) {
      return null;
    }
    if (Date.now() - parsed.createdAt > STATE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function federationStateCookieHeader(value: string): string {
  const secure = loadConfig().nodeEnv === "production";
  const parts = [
    `${FEDERATION_STATE_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(STATE_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearFederationStateCookieHeader(): string {
  const secure = loadConfig().nodeEnv === "production";
  const parts = [`${FEDERATION_STATE_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildFederationState(options: {
  providerKey: string;
  providerId: string;
  appId: string;
  clientId: string;
  returnTo: string | null;
}): FederationState {
  return {
    nonce: randomToken(24),
    providerKey: options.providerKey,
    providerId: options.providerId,
    appId: options.appId,
    clientId: options.clientId,
    returnTo: options.returnTo,
    createdAt: Date.now(),
  };
}

async function resolveClientSecret(secrets: ProviderSecrets): Promise<string> {
  if (secrets.builtinId === "apple") {
    const apple = parseAppleMetadata(secrets.providerMetadata);
    if (!apple) throw new Error("Apple provider is missing team or key configuration");
    return generateAppleClientSecret({
      teamId: apple.teamId,
      clientId: secrets.clientId,
      keyId: apple.keyId,
      privateKeyPem: secrets.clientSecret,
    });
  }
  return secrets.clientSecret;
}

export function buildUpstreamAuthorizeUrl(options: {
  secrets: ProviderSecrets;
  providerKey: string;
  origin: string;
  state: string;
  scopes: string;
}): string {
  const redirectUri = callbackUrlForKey(options.origin, options.providerKey);
  const url = new URL(options.secrets.authorizationUrl);
  url.searchParams.set("client_id", options.secrets.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", options.scopes);
  url.searchParams.set("state", options.state);

  if (options.secrets.builtinId === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
  }

  if (options.secrets.builtinId === "apple") {
    url.searchParams.set("response_mode", "query");
  }

  return url.toString();
}

async function postTokenRequest(
  tokenUrl: string,
  body: URLSearchParams,
  acceptJson = true,
): Promise<TokenResponse & { error?: string; error_description?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (acceptJson) headers.Accept = "application/json";

  const res = await fetch(tokenUrl, { method: "POST", headers, body: body.toString() });
  const contentType = res.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await res.json()) as TokenResponse & { error?: string; error_description?: string })
    : (Object.fromEntries(new URLSearchParams(await res.text())) as TokenResponse & {
        error?: string;
        error_description?: string;
      });

  if (!res.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "Token exchange failed");
  }
  return payload;
}

export async function exchangeUpstreamCode(options: {
  secrets: ProviderSecrets;
  providerKey: string;
  origin: string;
  code: string;
}): Promise<TokenResponse> {
  const redirectUri = callbackUrlForKey(options.origin, options.providerKey);
  const clientSecret = await resolveClientSecret(options.secrets);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: redirectUri,
    client_id: options.secrets.clientId,
    client_secret: clientSecret,
  });

  return postTokenRequest(options.secrets.tokenUrl, body, options.secrets.builtinId !== "github");
}

export async function refreshUpstreamToken(options: {
  secrets: ProviderSecrets;
  refreshToken: string;
}): Promise<TokenResponse> {
  const clientSecret = await resolveClientSecret(options.secrets);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: options.secrets.clientId,
    client_secret: clientSecret,
  });
  return postTokenRequest(options.secrets.tokenUrl, body, options.secrets.builtinId !== "github");
}

async function fetchJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "z0-auth",
    },
  });
  if (!res.ok) throw new Error(`Userinfo request failed (${res.status})`);
  return (await res.json()) as Record<string, unknown>;
}

async function normalizeGitHubProfile(accessToken: string, userinfoUrl: string): Promise<NormalizedIdpProfile> {
  const user = await fetchJson(userinfoUrl, accessToken);
  const subject = String(user.id ?? "");
  let email: string | null = typeof user.email === "string" ? user.email : null;
  let emailVerified = Boolean(email);

  if (!email) {
    const emails = await fetchJson("https://api.github.com/user/emails", accessToken);
    if (Array.isArray(emails)) {
      const primary =
        (emails as { email: string; primary: boolean; verified: boolean }[]).find(
          (entry) => entry.primary && entry.verified,
        ) ?? (emails as { email: string; verified: boolean }[]).find((entry) => entry.verified);
      if (primary) {
        email = primary.email;
        emailVerified = Boolean(primary.verified);
      }
    }
  }

  return {
    subject,
    email,
    emailVerified,
    name: typeof user.name === "string" ? user.name : typeof user.login === "string" ? user.login : null,
    raw: user,
  };
}

async function normalizeFacebookProfile(accessToken: string, userinfoUrl: string): Promise<NormalizedIdpProfile> {
  const url = new URL(userinfoUrl);
  url.searchParams.set("access_token", accessToken);
  const user = await fetchJson(url.toString(), accessToken);
  const subject = String(user.id ?? "");
  const email = typeof user.email === "string" ? user.email : null;
  return {
    subject,
    email,
    emailVerified: Boolean(email),
    name: typeof user.name === "string" ? user.name : null,
    raw: user,
  };
}

function normalizeAppleIdToken(idToken: string): NormalizedIdpProfile {
  const claims = decodeJwtPayload(idToken);
  const subject = String(claims.sub ?? "");
  const email = typeof claims.email === "string" ? claims.email : null;
  const emailVerified =
    claims.email_verified === true || claims.email_verified === "true";
  return {
    subject,
    email,
    emailVerified,
    name: typeof claims.name === "string" ? claims.name : null,
    raw: claims,
  };
}

async function normalizeOidcProfile(accessToken: string, userinfoUrl: string): Promise<NormalizedIdpProfile> {
  const user = await fetchJson(userinfoUrl, accessToken);
  const subject = String(user.sub ?? user.id ?? "");
  const email = typeof user.email === "string" ? user.email : null;
  const emailVerified = user.email_verified === true;
  const name =
    typeof user.name === "string"
      ? user.name
      : typeof user.given_name === "string"
        ? user.given_name
        : null;
  return { subject, email, emailVerified, name, raw: user };
}

export async function normalizeProviderProfile(
  secrets: ProviderSecrets,
  accessToken: string,
  idToken?: string | null,
): Promise<NormalizedIdpProfile> {
  if (secrets.builtinId === "apple") {
    if (!idToken) throw new Error("Apple sign-in did not return an id_token");
    return normalizeAppleIdToken(idToken);
  }

  if (secrets.builtinId === "github") {
    if (!secrets.userinfoUrl) throw new Error("Userinfo URL is not configured for this provider");
    return normalizeGitHubProfile(accessToken, secrets.userinfoUrl);
  }

  if (secrets.builtinId === "facebook") {
    if (!secrets.userinfoUrl) throw new Error("Userinfo URL is not configured for this provider");
    return normalizeFacebookProfile(accessToken, secrets.userinfoUrl);
  }

  if (!secrets.userinfoUrl) {
    throw new Error("Userinfo URL is not configured for this provider");
  }

  return normalizeOidcProfile(accessToken, secrets.userinfoUrl);
}

export async function loadSecretsForProviderId(providerId: string): Promise<ProviderSecrets | null> {
  return getProviderSecrets(providerId);
}

export function federationStartUrl(providerKey: string, clientId: string, returnTo?: string): string {
  const params = new URLSearchParams({ client_id: clientId });
  if (returnTo) params.set("return_to", returnTo);
  return `/auth/federation/${encodeURIComponent(providerKey)}/start?${params.toString()}`;
}

export function resolveFederationOrigin(req: Request): string {
  return requestPublicOrigin(req);
}

export async function resolveRequestedScopes(appId: string, providerId: string, fallback: string): Promise<string> {
  const [row] = await getDb()`
    SELECT requested_scopes
    FROM app_identity_providers
    WHERE app_id = ${appId}
      AND identity_provider_id = ${providerId}
      AND enabled = true
    LIMIT 1
  `;
  const requested = row ? String((row as { requested_scopes: string | null }).requested_scopes ?? "").trim() : "";
  return requested || fallback;
}
