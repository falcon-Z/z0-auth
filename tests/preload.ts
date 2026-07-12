/**
 * Loaded before `bun test`. Bun sets NODE_ENV=test and loads `.env` then `.env.test`;
 * DATABASE_URL in `.env.test` overrides the dev value for the test run.
 */
import { afterAll, beforeEach } from "bun:test";

import { closeDatabase } from "../src/api/lib/db";
import { initializeInstanceKeys } from "../src/api/lib/instance-keys";
import { resetRateLimitsForTests } from "../src/api/lib/rate-limit";
import { databaseNameFromUrl } from "./helpers/db";

const databaseSuitesRequested = Bun.argv.some((argument) =>
  /(?:^|[\\/])tests[\\/](?:integration|api)(?:[\\/]|$)/.test(argument),
);

if (databaseSuitesRequested) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for integration and API tests. " +
        "Set it in .env.test to a dedicated database whose name ends with _test.",
    );
  }

  const databaseName = databaseNameFromUrl(databaseUrl);
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Integration and API tests require a database whose name ends with _test (got "${databaseName}").`,
    );
  }
}

await initializeInstanceKeys();

beforeEach(() => {
  resetRateLimitsForTests();
});

afterAll(async () => {
  await closeDatabase();
});
