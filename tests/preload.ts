/**
 * Loaded before `bun test`. Applies repo `.env` then `.env.test` without
 * overriding variables already set in the shell (e.g. CI).
 */
import path from "node:path";

import { initializeInstanceKeys } from "../src/api/lib/instance-keys";
import { loadEnvFile, loadRootEnv } from "../src/lib/load-root-env";

loadRootEnv();
loadEnvFile(path.join(import.meta.dir, "../.env.test"));

process.env.INSTANCE_KEYS_PATH =
  process.env.INSTANCE_KEYS_PATH?.trim() ||
  path.join(import.meta.dir, "../.data/test-instance-keys.json");

/** Stable data key for tests — same material across runs (not production material). */
if (!process.env.INSTANCE_DATA_KEY?.trim()) {
  process.env.INSTANCE_DATA_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}

await initializeInstanceKeys();

const devDatabaseUrl = process.env.DATABASE_URL?.trim();
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (testDatabaseUrl) {
  if (devDatabaseUrl && testDatabaseUrl === devDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL must not match DATABASE_URL. Integration tests wipe their database; use a separate database on the same Postgres instance (see .env.test).",
    );
  }
  if (devDatabaseUrl) {
    process.env.Z0_DEV_DATABASE_URL = devDatabaseUrl;
  }
  process.env.DATABASE_URL = testDatabaseUrl;
}
