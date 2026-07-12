import { closeDatabase } from "../../src/api/lib/db";
import { createPgSql } from "../../src/api/lib/create-pg-sql";
import { resetAndMigrateDatabase } from "../../src/scripts/migrations";

export function databaseNameFromUrl(url: string): string {
  const parsed = new URL(url.replace(/^postgresql:/, "http:"));
  const name = parsed.pathname.replace(/^\//, "");
  if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid database name in DATABASE_URL: ${name || "(empty)"}`);
  }
  return name;
}

function assertSafeTestDatabaseUrl(url: string): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetTestDatabase only runs when NODE_ENV=test.");
  }

  const name = databaseNameFromUrl(url);
  if (!name.endsWith("_test")) {
    throw new Error(
      `Integration tests only reset databases whose name ends with "_test" (got "${name}"). ` +
        "Set DATABASE_URL in .env.test to a dedicated test database.",
    );
  }
}

/** Drops schema and reapplies migrations on DATABASE_URL (same as `bun run db:reset`). */
export async function resetTestDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;

  assertSafeTestDatabaseUrl(url);

  await closeDatabase();

  const db = createPgSql(url);
  await resetAndMigrateDatabase(db, undefined, false);
  await db.close();
}

export const hasTestDatabase = (): boolean =>
  process.env.NODE_ENV === "test" && Boolean(process.env.DATABASE_URL?.trim());
