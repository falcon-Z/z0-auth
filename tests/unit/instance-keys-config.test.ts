import { unlink } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  initializeInstanceKeys,
  parseDataKeyMaterial,
  resetInstanceKeysForTests,
} from "../../src/api/lib/instance-keys";

const isolatedKeysPath = path.join(import.meta.dir, "../.data/unit-test-instance-keys.json");

describe("instance-keys configuration", () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
    resetInstanceKeysForTests();
  });

  beforeEach(async () => {
    resetInstanceKeysForTests();
    process.env.INSTANCE_KEYS_PATH = isolatedKeysPath;
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

  test("production leaves keys missing when env and file are absent", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.INSTANCE_DATA_KEY;
    delete process.env.INSTANCE_TOKEN_PRIVATE_KEY;
    delete process.env.INSTANCE_TOKEN_PUBLIC_KEY;

    await initializeInstanceKeys();
    const { getInstanceKeySources, areInstanceKeysReady } = await import(
      "../../src/api/lib/instance-keys"
    );
    expect(getInstanceKeySources()?.dataKey).toBe("missing");
    expect(getInstanceKeySources()?.tokenKeys).toBe("missing");
    expect(areInstanceKeysReady()).toBe(false);
  });

  test("production is not ready when only data key is in env", async () => {
    process.env.NODE_ENV = "production";
    process.env.INSTANCE_DATA_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    delete process.env.INSTANCE_TOKEN_PRIVATE_KEY;
    delete process.env.INSTANCE_TOKEN_PUBLIC_KEY;

    await initializeInstanceKeys();
    const { areInstanceKeysReady } = await import("../../src/api/lib/instance-keys");
    expect(areInstanceKeysReady()).toBe(false);
  });

  test("production loads when data and token keys are in env", async () => {
    process.env.NODE_ENV = "production";
    process.env.INSTANCE_DATA_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    delete process.env.INSTANCE_KEYS_PATH;

    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const priv = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const pub = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    process.env.INSTANCE_TOKEN_PRIVATE_KEY = Buffer.from(priv).toString("base64");
    process.env.INSTANCE_TOKEN_PUBLIC_KEY = Buffer.from(pub).toString("base64");

    await initializeInstanceKeys();
    const { getInstanceKeySources } = await import("../../src/api/lib/instance-keys");
    expect(getInstanceKeySources()?.dataKey).toBe("env");
    expect(getInstanceKeySources()?.tokenKeys).toBe("env");
  });
});
