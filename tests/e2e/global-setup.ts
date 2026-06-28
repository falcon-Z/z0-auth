import { execSync } from "node:child_process";

export default async function globalSetup() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for e2e (see .env.test).");
  }

  execSync("bun src/scripts/db-reset.ts", {
    env: process.env,
    stdio: "inherit",
  });
}
