const APPLE_AUDIENCE = "https://appleid.apple.com";

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
