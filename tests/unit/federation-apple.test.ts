import { describe, expect, test } from "bun:test";

import { decodeJwtPayload, generateAppleClientSecret } from "../../src/api/lib/federation-apple";

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
});
