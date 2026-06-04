import { beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";

import { decryptSecret, encryptSecret } from "../../src/api/lib/settings-crypto";
import { initializeInstanceKeys, resetInstanceKeysForTests } from "../../src/api/lib/instance-keys";
import { signResetToken, verifyResetToken } from "../../src/api/lib/instance-keys";

describe("instance keys", () => {
  beforeAll(async () => {
    resetInstanceKeysForTests();
    process.env.INSTANCE_KEYS_PATH = path.join(import.meta.dir, "../../.data/unit-test-keys.json");
    await initializeInstanceKeys();
  });

  test("round-trips SMTP password ciphertext with data key", async () => {
    const plain = "smtp-secret-value";
    const cipher = await encryptSecret(plain);
    expect(cipher).not.toContain(plain);
    const restored = await decryptSecret(cipher);
    expect(restored).toBe(plain);
  });

  test("signs and verifies reset tokens with token keypair", async () => {
    const payload = {
      v: 1 as const,
      uid: "00000000-0000-4000-8000-000000000001",
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "00000000-0000-4000-8000-000000000099",
    };
    const token = await signResetToken(payload);
    const verified = await verifyResetToken(token);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.uid).toBe(payload.uid);
      expect(verified.payload.jti).toBe(payload.jti);
    }
  });
});
