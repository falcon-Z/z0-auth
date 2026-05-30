/**
 * Loaded before `bun test`. Applies repo `.env` then `.env.test` without
 * overriding variables already set in the shell (e.g. CI).
 */
import path from "node:path";

import { loadEnvFile, loadRootEnv } from "../src/lib/load-root-env";

loadRootEnv();
loadEnvFile(path.join(import.meta.dir, "../.env.test"));

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
