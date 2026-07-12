const APPLE_AUDIENCE = "https://appleid.apple.com";
const CLOCK_SKEW_SECONDS = 60;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const JWKS_TIMEOUT_MS = 5_000;
const appleJwkCache = new Map<string, { jwk: JsonWebKey; expiresAt: number }>();

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlEncodeText(text: string): string {
  return base64UrlEncode(new TextEncoder().encode(text));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const normalized = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = Buffer.from(normalized, "base64");
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Invalid JWT");
  const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function decodeJwtObject(value: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as Record<string, unknown>;
}

export async function verifyAppleIdToken(options: {
  token: string;
  clientId: string;
  nonce: string;
  jwksUrl: string;
}): Promise<Record<string, unknown>> {
  const parts = options.token.split(".");
  if (parts.length !== 3) throw new Error("Apple id_token is malformed");

  const header = decodeJwtObject(parts[0]!);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("Apple id_token uses an unsupported signing key");
  }

  const cacheKey = `${options.jwksUrl}\n${header.kid}`;
  const cached = appleJwkCache.get(cacheKey);
  let jwk = cached && cached.expiresAt > Date.now() ? cached.jwk : undefined;
  if (!jwk) {
    appleJwkCache.delete(cacheKey);
    const response = await fetch(options.jwksUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("Apple signing keys are unavailable");
    const jwks = (await response.json()) as { keys?: JsonWebKey[] };
    jwk = jwks.keys?.find(
      (candidate) => candidate.kid === header.kid && candidate.kty === "RSA" && candidate.alg === "RS256",
    );
    if (jwk) appleJwkCache.set(cacheKey, { jwk, expiresAt: Date.now() + JWKS_CACHE_TTL_MS });
  }
  if (!jwk) throw new Error("Apple id_token signing key was not found");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlDecode(parts[2]!),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!validSignature) throw new Error("Apple id_token signature is invalid");

  const claims = decodeJwtObject(parts[1]!);
  const now = Math.floor(Date.now() / 1000);
  const audience = claims.aud;
  const audienceMatches =
    audience === options.clientId ||
    (Array.isArray(audience) && audience.some((value) => value === options.clientId));
  if (claims.iss !== APPLE_AUDIENCE || !audienceMatches) {
    throw new Error("Apple id_token issuer or audience is invalid");
  }
  if (typeof claims.exp !== "number" || claims.exp < now - CLOCK_SKEW_SECONDS) {
    throw new Error("Apple id_token is expired");
  }
  if (typeof claims.iat === "number" && claims.iat > now + CLOCK_SKEW_SECONDS) {
    throw new Error("Apple id_token issue time is invalid");
  }
  if (claims.nonce !== options.nonce) throw new Error("Apple id_token nonce is invalid");
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("Apple id_token subject is missing");
  return claims;
}

export async function generateAppleClientSecret(options: {
  teamId: string;
  clientId: string;
  keyId: string;
  privateKeyPem: string;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(options.privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: options.keyId, typ: "JWT" };
  const payload = {
    iss: options.teamId,
    iat: now,
    exp: now + 60 * 5,
    aud: APPLE_AUDIENCE,
    sub: options.clientId,
  };

  const unsigned = `${base64UrlEncodeText(JSON.stringify(header))}.${base64UrlEncodeText(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned),
  );

  const sigBytes = new Uint8Array(signature);
  return `${unsigned}.${base64UrlEncode(sigBytes)}`;
}

export type AppleProviderMetadata = {
  teamId: string;
  keyId: string;
};

export function parseAppleMetadata(raw: unknown): AppleProviderMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const apple = (raw as { apple?: unknown }).apple;
  if (!apple || typeof apple !== "object") return null;
  const teamId = (apple as { teamId?: unknown }).teamId;
  const keyId = (apple as { keyId?: unknown }).keyId;
  if (typeof teamId !== "string" || !teamId.trim()) return null;
  if (typeof keyId !== "string" || !keyId.trim()) return null;
  return { teamId: teamId.trim(), keyId: keyId.trim() };
}
