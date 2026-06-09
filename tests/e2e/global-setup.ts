import { execSync } from "node:child_process";
import path from "node:path";

import { loadEnvFile, loadRootEnv } from "../../src/lib/load-root-env";

export default async function globalSetup() {
  loadRootEnv();
  loadEnvFile(path.join(process.cwd(), ".env.test"));
  const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for e2e (see .env.test).");
  }

  execSync("bun src/scripts/db-reset.ts", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
