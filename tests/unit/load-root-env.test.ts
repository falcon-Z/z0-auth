import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("loadRootEnv", () => {
  const saved = process.env.TEST_LOAD_ROOT_ENV;

  afterEach(() => {
    if (saved === undefined) delete process.env.TEST_LOAD_ROOT_ENV;
    else process.env.TEST_LOAD_ROOT_ENV = saved;
  });

  test("does not override variables already in the environment", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "z0-env-"));
    const envFile = path.join(dir, ".env");
    writeFileSync(envFile, "TEST_LOAD_ROOT_ENV=from_file\n", "utf8");

    process.env.TEST_LOAD_ROOT_ENV = "from_process";

    const { loadEnvFile } = await import("../../packages/server/src/lib/load-root-env");
    loadEnvFile(envFile);

    expect(process.env.TEST_LOAD_ROOT_ENV).toBe("from_process");
    rmSync(dir, { recursive: true });
  });

  test("loads unset variables from file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "z0-env-"));
    const envFile = path.join(dir, ".env");
    writeFileSync(envFile, "TEST_LOAD_ROOT_ENV=from_file\n", "utf8");

    delete process.env.TEST_LOAD_ROOT_ENV;

    const { loadEnvFile } = await import("../../packages/server/src/lib/load-root-env");
    loadEnvFile(envFile);

    expect(process.env.TEST_LOAD_ROOT_ENV).toBe("from_file");
    rmSync(dir, { recursive: true });
  });
});
