import { decryptWithDataKey, encryptWithDataKey } from "./instance-keys";
import { getDb } from "./db";
import { randomToken } from "./crypto";

type SigningKeyRow = {
  id: string;
  kid: string;
  algorithm: "RS256";
  public_jwk: unknown;
  private_key_ciphertext: string;
};

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

function toNumericDate(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

async function ensureActiveSigningKey(): Promise<SigningKeyRow> {
  const [existing] = await getDb()`
    SELECT id, kid, algorithm, public_jwk, private_key_ciphertext
    FROM oidc_signing_keys
    WHERE status = 'active'
    ORDER BY activated_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;
  if (existing) {
    return existing as SigningKeyRow;
  }

  const generated = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", generated.publicKey);
  const privatePkcs8 = await crypto.subtle.exportKey("pkcs8", generated.privateKey);
  const privateKeyB64 = Buffer.from(privatePkcs8).toString("base64");
  const encryptedPrivateKey = await encryptWithDataKey(privateKeyB64);

  const kid = `z0_oidc_${randomToken(8)}`;
  const jwk = {
    ...publicJwk,
    use: "sig",
    alg: "RS256",
    kid,
  };

  try {
    const [inserted] = await getDb()`
      INSERT INTO oidc_signing_keys (
        kid,
        algorithm,
        public_jwk,
        private_key_ciphertext,
        status,
        activated_at
      )
      VALUES (
        ${kid},
        'RS256',
        ${jwk},
        ${encryptedPrivateKey},
        'active',
        NOW()
      )
      RETURNING id, kid, algorithm, public_jwk, private_key_ciphertext
    `;
    if (inserted) return inserted as SigningKeyRow;
  } catch {
    // Another concurrent request may have created the active key first.
  }

  const [activeAfterInsert] = await getDb()`
    SELECT id, kid, algorithm, public_jwk, private_key_ciphertext
    FROM oidc_signing_keys
    WHERE status = 'active'
    ORDER BY activated_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;
  if (activeAfterInsert) return activeAfterInsert as SigningKeyRow;
  throw new Error("oidc_signing_key_unavailable");
}

async function getActiveSigningKey(): Promise<SigningKeyRow> {
  return ensureActiveSigningKey();
}

export async function getJwks(): Promise<{ keys: Array<Record<string, unknown>> }> {
  const rows = await getDb()`
    SELECT public_jwk
    FROM oidc_signing_keys
    WHERE status IN ('active', 'retired')
    ORDER BY activated_at DESC NULLS LAST, created_at DESC
  `;
  if (rows.length === 0) {
    const active = await ensureActiveSigningKey();
    return { keys: [active.public_jwk as Record<string, unknown>] };
  }
  return {
    keys: (rows as Array<{ public_jwk: unknown }>).map((row) => row.public_jwk as Record<string, unknown>),
  };
}

export function hasOpenIdScope(scope: string): boolean {
  return scope
    .trim()
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .includes("openid");
}

export async function issueIdToken(input: {
  issuer: string;
  audience: string;
  subject: string;
  email?: string | null;
  emailVerified?: boolean;
  name?: string | null;
  grantedScope: string;
  nonce?: string | null;
  expiresInSeconds?: number;
}): Promise<string> {
  const signingKey = await getActiveSigningKey();
  const decrypted = await decryptWithDataKey(signingKey.private_key_ciphertext);
  const keyData = Buffer.from(decrypted, "base64");
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.expiresInSeconds ?? 3600) * 1000);
  const scopeSet = new Set(
    input.grantedScope
      .trim()
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean),
  );

  const claims: Record<string, unknown> = {
    iss: input.issuer,
    sub: input.subject,
    aud: input.audience,
    iat: toNumericDate(now),
    exp: toNumericDate(expiresAt),
  };
  if (input.nonce) claims.nonce = input.nonce;

  if (scopeSet.has("email") && input.email) {
    claims.email = input.email;
    claims.email_verified = Boolean(input.emailVerified);
  }
  if (scopeSet.has("profile") && input.name) {
    claims.name = input.name;
  }

  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: signingKey.kid,
  };

  const unsignedToken = `${base64UrlEncodeText(JSON.stringify(header))}.${base64UrlEncodeText(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(unsignedToken),
  );
  return `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export function buildDiscoveryDocument(input: { issuer: string }): Record<string, unknown> {
  const issuer = input.issuer.replace(/\/+$/, "");
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    introspection_endpoint: `${issuer}/oauth/introspect`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    introspection_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "profile", "email"],
  };
}
