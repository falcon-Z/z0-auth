import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  decryptWithDataKey,
  encryptWithDataKey,
  signResetToken,
  initializeInstanceKeys,
  parseDataKeyMaterial,
  resetInstanceKeysForTests,
  verifyResetToken,
} from "../../src/api/lib/instance-keys";

const isolatedKeysPath = path.join(import.meta.dir, "../.data/unit-test-instance-keys.json");

async function generateTokenKeyEnv(): Promise<{ privateKey: string; publicKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const priv = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pub = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return {
    privateKey: Buffer.from(priv).toString("base64"),
    publicKey: Buffer.from(pub).toString("base64"),
  };
}

describe("instance-keys configuration", () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
    resetInstanceKeysForTests();
  });

  beforeEach(async () => {
    resetInstanceKeysForTests();
    process.env.INSTANCE_KEYS_PATH = isolatedKeysPath;
    await mkdir(path.dirname(isolatedKeysPath), { recursive: true });
    try {
      await unlink(isolatedKeysPath);
    } catch {
      /* no file yet */
    }
  });

  test("parseDataKeyMaterial accepts 64-char hex", () => {
    const hex = "0123456789abcdef".repeat(4);
    const bytes = parseDataKeyMaterial(hex);
    expect(bytes?.length).toBe(32);
  });

  test("production without env keys fails closed instead of auto-generating", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.INSTANCE_DATA_KEY;
    delete process.env.INSTANCE_TOKEN_PRIVATE_KEY;
    delete process.env.INSTANCE_TOKEN_PUBLIC_KEY;

    await expect(initializeInstanceKeys()).rejects.toThrow("Production instance keys are not configured");
    const { getInstanceKeySources, areInstanceKeysReady } = await import(
      "../../src/api/lib/instance-keys"
    );
    expect(getInstanceKeySources()?.dataKey).toBe("missing");
    expect(getInstanceKeySources()?.tokenKeys).toBe("missing");
    expect(areInstanceKeysReady()).toBe(false);
  });

  test("production with only data key fails instead of generating token keys", async () => {
    process.env.NODE_ENV = "production";
    process.env.INSTANCE_DATA_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    delete process.env.INSTANCE_TOKEN_PRIVATE_KEY;
    delete process.env.INSTANCE_TOKEN_PUBLIC_KEY;

    await expect(initializeInstanceKeys()).rejects.toThrow("Production instance keys are not configured");
    const { getInstanceKeySources, areInstanceKeysReady } = await import("../../src/api/lib/instance-keys");
    expect(getInstanceKeySources()?.dataKey).toBe("env");
    expect(getInstanceKeySources()?.tokenKeys).toBe("missing");
    expect(areInstanceKeysReady()).toBe(false);
  });

  test("production with partial token key env fails clearly", async () => {
    process.env.NODE_ENV = "production";
    process.env.INSTANCE_DATA_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.INSTANCE_TOKEN_PRIVATE_KEY = "not-a-real-private-key";
    delete process.env.INSTANCE_TOKEN_PUBLIC_KEY;

    await expect(initializeInstanceKeys()).rejects.toThrow(
      "Set both INSTANCE_TOKEN_PRIVATE_KEY and INSTANCE_TOKEN_PUBLIC_KEY",
    );
  });

  test("production loads when data and token keys are in env", async () => {
    process.env.NODE_ENV = "production";
    process.env.INSTANCE_DATA_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.INSTANCE_DATA_KEY_ID = "prod-data-2026-07";
    process.env.INSTANCE_TOKEN_KEY_ID = "prod-token-2026-07";
    delete process.env.INSTANCE_KEYS_PATH;

    const tokenKeys = await generateTokenKeyEnv();
    process.env.INSTANCE_TOKEN_PRIVATE_KEY = tokenKeys.privateKey;
    process.env.INSTANCE_TOKEN_PUBLIC_KEY = tokenKeys.publicKey;

    await initializeInstanceKeys();
    const { getInstanceKeySources } = await import("../../src/api/lib/instance-keys");
    expect(getInstanceKeySources()?.dataKey).toBe("env");
    expect(getInstanceKeySources()?.tokenKeys).toBe("env");
    expect(getInstanceKeySources()?.dataKeyId).toBe("prod-data-2026-07");
    expect(getInstanceKeySources()?.tokenKeyId).toBe("prod-token-2026-07");
  });

  test("development without env keys still auto-generates local file-backed keys", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.INSTANCE_DATA_KEY;
    delete process.env.INSTANCE_TOKEN_PRIVATE_KEY;
    delete process.env.INSTANCE_TOKEN_PUBLIC_KEY;

    await initializeInstanceKeys();
    const { getInstanceKeySources, areInstanceKeysReady } = await import("../../src/api/lib/instance-keys");
    expect(getInstanceKeySources()?.dataKey).toBe("generated");
    expect(getInstanceKeySources()?.tokenKeys).toBe("generated");
    expect(areInstanceKeysReady()).toBe(true);
  });

  test("development preserves an existing file data key when generating missing token keys", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.INSTANCE_DATA_KEY;
    delete process.env.INSTANCE_DATA_KEY_ID;
    delete process.env.INSTANCE_TOKEN_PRIVATE_KEY;
    delete process.env.INSTANCE_TOKEN_PUBLIC_KEY;
    delete process.env.INSTANCE_TOKEN_KEY_ID;
    const dataKey = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
    await Bun.write(
      isolatedKeysPath,
      `${JSON.stringify({ version: 2, dataKey, dataKeyId: "existing-data-key" }, null, 2)}\n`,
      { mode: 0o600 },
    );

    await initializeInstanceKeys();
    const { getInstanceKeySources } = await import("../../src/api/lib/instance-keys");
    const stored = JSON.parse(await readFile(isolatedKeysPath, "utf8")) as {
      dataKey?: string;
      dataKeyId?: string;
      tokenPrivateKey?: string;
      tokenPublicKey?: string;
      tokenKeyId?: string;
    };

    expect(getInstanceKeySources()?.dataKey).toBe("file");
    expect(getInstanceKeySources()?.tokenKeys).toBe("generated");
    expect(stored.dataKey).toBe(dataKey);
    expect(stored.dataKeyId).toBe("existing-data-key");
    expect(stored.tokenPrivateKey).toBeTruthy();
    expect(stored.tokenPublicKey).toBeTruthy();
    expect(stored.tokenKeyId).toBe("dev-generated-token-key");
  });

  test("new encrypted values and reset tokens carry key ids", async () => {
    process.env.NODE_ENV = "production";
    process.env.INSTANCE_DATA_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.INSTANCE_DATA_KEY_ID = "prod-data-2026-07";
    process.env.INSTANCE_TOKEN_KEY_ID = "prod-token-2026-07";
    delete process.env.INSTANCE_KEYS_PATH;

    const tokenKeys = await generateTokenKeyEnv();
    process.env.INSTANCE_TOKEN_PRIVATE_KEY = tokenKeys.privateKey;
    process.env.INSTANCE_TOKEN_PUBLIC_KEY = tokenKeys.publicKey;

    await initializeInstanceKeys();

    const cipher = await encryptWithDataKey("smtp-secret");
    expect(cipher.startsWith("z0enc:v1:")).toBe(true);
    expect(await decryptWithDataKey(cipher)).toBe("smtp-secret");

    const token = await signResetToken({
      v: 1,
      uid: "00000000-0000-4000-8000-000000000001",
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: "00000000-0000-4000-8000-000000000099",
    });
    expect(token.startsWith("z0rt.v1.")).toBe(true);
    const verified = await verifyResetToken(token);
    expect(verified.ok).toBe(true);
  });
});
