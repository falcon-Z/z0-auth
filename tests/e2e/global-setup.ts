import { execFileSync } from "node:child_process";

export default async function globalSetup() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for e2e (see .env.test).");
  }
  if (process.env.NODE_ENV !== "test") {
    throw new Error("E2E database reset requires NODE_ENV=test.");
  }
  const parsed = new URL(databaseUrl.replace(/^postgresql:/, "http:"));
  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!/^[A-Za-z0-9_]+$/.test(databaseName) || !databaseName.endsWith("_test")) {
    throw new Error(`E2E reset requires a database whose name ends with _test (got "${databaseName}").`);
  }

  execFileSync("bun", ["src/scripts/db-reset.ts"], {
    env: process.env,
    stdio: "inherit",
  });
}
