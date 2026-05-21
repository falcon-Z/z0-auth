import { describe, expect, test } from "bun:test";

import {
  generateRecoveryKey,
  normalizeRecoveryKey,
  hashRecoveryKey,
  verifyRecoveryKey,
} from "../../src/api/lib/recovery-key";

describe("recovery key", () => {
  test("generates formatted key", () => {
    const key = generateRecoveryKey();
    expect(key).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4})+$/);
  });

  test("normalize strips separators", () => {
    expect(normalizeRecoveryKey("ABCD-EFGH")).toBe("ABCDEFGH");
  });

  test("hash and verify", async () => {
    const key = generateRecoveryKey();
    const hash = await hashRecoveryKey(key);
    expect(await verifyRecoveryKey(key, hash)).toBe(true);
    expect(await verifyRecoveryKey("WRONG-KEY-AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG", hash)).toBe(false);
  });
});
