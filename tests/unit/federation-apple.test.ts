import { describe, expect, test } from "bun:test";

import {
  decodeJwtPayload,
  generateAppleClientSecret,
  verifyAppleIdToken,
} from "../../src/api/lib/federation-apple";

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Buffer.from(bytes).toString("base64url");
}

async function signedAppleToken(input: {
  privateKey: CryptoKey;
  audience?: string;
  nonce?: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: "apple-test-key", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: "https://appleid.apple.com",
    aud: input.audience ?? "com.example.app",
    sub: "apple-user-1",
    email: "apple@example.com",
    email_verified: "true",
    nonce: input.nonce ?? "expected-nonce",
    iat: now,
    exp: now + 300,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    input.privateKey,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function generateTestPrivateKeyPem(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const body = Buffer.from(pkcs8).toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
}

describe("federation apple", () => {
  test("generateAppleClientSecret returns a three-part JWT", async () => {
    const privateKeyPem = await generateTestPrivateKeyPem();
    const token = await generateAppleClientSecret({
      teamId: "TEAM123",
      clientId: "com.example.app",
      keyId: "KEY123",
      privateKeyPem,
    });
    const parts = token.split(".");
    expect(parts.length).toBe(3);
    const payload = decodeJwtPayload(token);
    expect(payload.iss).toBe("TEAM123");
    expect(payload.sub).toBe("com.example.app");
    expect(payload.aud).toBe("https://appleid.apple.com");
  });

  test("verifies signature, issuer, audience, expiry, and nonce", async () => {
    const keys = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
    Object.assign(jwk, { kid: "apple-test-key", alg: "RS256", use: "sig" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ keys: [jwk] });
    try {
      const token = await signedAppleToken({ privateKey: keys.privateKey });
      const claims = await verifyAppleIdToken({
        token,
        clientId: "com.example.app",
        nonce: "expected-nonce",
        jwksUrl: "https://apple.test/keys",
      });
      expect(claims.sub).toBe("apple-user-1");

      await expect(verifyAppleIdToken({
        token,
        clientId: "wrong-client",
        nonce: "expected-nonce",
        jwksUrl: "https://apple.test/keys",
      })).rejects.toThrow("issuer or audience");
      await expect(verifyAppleIdToken({
        token,
        clientId: "com.example.app",
        nonce: "wrong-nonce",
        jwksUrl: "https://apple.test/keys",
      })).rejects.toThrow("nonce");

      const parts = token.split(".");
      const tampered = `${parts[0]}.${base64Url(JSON.stringify({ sub: "attacker" }))}.${parts[2]}`;
      await expect(verifyAppleIdToken({
        token: tampered,
        clientId: "com.example.app",
        nonce: "expected-nonce",
        jwksUrl: "https://apple.test/keys",
      })).rejects.toThrow("signature");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
