import { describe, expect, test } from "bun:test";
import path from "node:path";

import { verifyPassword } from "../../src/api/lib/password";
import { qualifyBunRuntime } from "../../src/scripts/qualify-bun-runtime";

const projectRoot = path.join(import.meta.dir, "../..");

describe("Bun runtime qualification", () => {
  test("the executing runtime matches every release declaration", async () => {
    const qualification = await qualifyBunRuntime(projectRoot);
    const supportedVersion = "1.3.14";

    expect(qualification.version).toBe(supportedVersion);
    for (const declaredVersion of Object.values(qualification.declarations)) {
      expect(declaredVersion).toBe(supportedVersion);
    }
  });

  test("the pinned runtime verifies the stored-password compatibility fixture", async () => {
    const existingHash = "$argon2id$v=19$m=19456,t=2,p=1$Ju57gdqmZ2KHXH9XW6F8F1DjbVxmX/YFpSI3l/rLc8Y$pK6PCSZJMPkPmuue662nCf+Bk8aRGYDkmygEvgQQPA8";

    expect(await verifyPassword("z0-runtime-qualification", existingHash)).toBe(true);
    expect(await verifyPassword("not-the-password", existingHash)).toBe(false);
  });
});
