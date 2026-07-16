import { describe, expect, test } from "bun:test";

import {
  decodeBase32,
  encodeBase32,
  generateRecoveryCode,
  generateTotpCode,
  normalizeRecoveryCode,
  normalizeTotpCode,
  provisioningUri,
  verifyTotpCode,
} from "../../src/api/lib/totp";

describe("TOTP", () => {
  test("encodes and decodes Base32", () => {
    const bytes = new TextEncoder().encode("12345678901234567890");
    const encoded = encodeBase32(bytes);
    expect(encoded).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(new TextDecoder().decode(decodeBase32(encoded))).toBe("12345678901234567890");
  });

  test("matches RFC 6238 SHA-1 vectors after six-digit truncation", async () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(await generateTotpCode(secret, 59_000)).toBe("287082");
    expect(await generateTotpCode(secret, 1_111_111_109_000)).toBe("081804");
    expect(await generateTotpCode(secret, 2_000_000_000_000)).toBe("279037");
  });

  test("accepts only six digit TOTP input and a one-step clock window", async () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const code = await generateTotpCode(secret, 90_000);
    expect(normalizeTotpCode(` ${code.slice(0, 3)} ${code.slice(3)} `)).toBe(code);
    expect(normalizeTotpCode("12345a")).toBeNull();
    expect(await verifyTotpCode(secret, code, 120_000)).toBe(true);
    expect(await verifyTotpCode(secret, code, 180_000)).toBe(false);
  });

  test("generates normalized 128-bit recovery codes", () => {
    const code = generateRecoveryCode();
    expect(code.split("-").join("").length).toBe(26);
    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(code.replaceAll("-", ""));
  });

  test("builds an interoperable provisioning URI", () => {
    const uri = provisioningUri({ secret: "ABC234", issuer: "z0 auth", account: "a@example.com" });
    expect(uri).toStartWith("otpauth://totp/z0%20auth%3Aa%40example.com?");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
