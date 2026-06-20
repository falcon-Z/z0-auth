import { randomToken } from "./crypto";
import { loadConfig, requestPublicOrigin } from "./config";
import { getProviderSecrets, callbackUrlForKey, type ProviderSecrets } from "./federation-providers";
import type { NormalizedIdpProfile } from "./federation-linking";

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
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export async function exchangeUpstreamCode(options: {
  secrets: ProviderSecrets;
  providerKey: string;
  origin: string;
  code: string;
}): Promise<TokenResponse> {
  const redirectUri = callbackUrlForKey(options.origin, options.providerKey);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: redirectUri,
    client_id: options.secrets.clientId,
    client_secret: options.secrets.clientSecret,
  });

  const res = await fetch(options.secrets.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const payload = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "Token exchange failed");
  }
  return payload;
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
      const primary = (emails as { email: string; primary: boolean; verified: boolean }[]).find(
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
): Promise<NormalizedIdpProfile> {
  if (!secrets.userinfoUrl) {
    throw new Error("Userinfo URL is not configured for this provider");
  }

  if (secrets.builtinId === "github") {
    return normalizeGitHubProfile(accessToken, secrets.userinfoUrl);
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
