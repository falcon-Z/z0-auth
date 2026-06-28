/**
 * Loaded before `bun test`. Bun sets NODE_ENV=test and loads `.env` then `.env.test`;
 * DATABASE_URL in `.env.test` overrides the dev value for the test run.
 */
import { afterAll } from "bun:test";

import { closeDatabase } from "../src/api/lib/db";
import { initializeInstanceKeys } from "../src/api/lib/instance-keys";

await initializeInstanceKeys();

afterAll(async () => {
  await closeDatabase();
});
