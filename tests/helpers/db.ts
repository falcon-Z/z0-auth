import { SQL } from "bun";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { closeDatabase } from "../../src/api/lib/db";
import { loadRootEnv } from "../../src/lib/load-root-env";

loadRootEnv();

export function getTestDatabaseUrl(): string | null {
  return process.env.DATABASE_URL?.trim() || null;
}

/** Drops schema and reapplies migrations on DATABASE_URL (same as `bun run db:reset`). */
export async function resetTestDatabase(): Promise<void> {
  const url = getTestDatabaseUrl();
  if (!url) return;

  await closeDatabase();

  const sqlDir = path.join(import.meta.dir, "../../src/scripts/sql");
  const resetSql = await Bun.file(path.join(sqlDir, "reset.sql")).text();
  const schemaSql = await Bun.file(path.join(sqlDir, "schema.sql")).text();
  const migrationsDir = path.join(sqlDir, "migrations");
  const migrationFiles = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  const db = new SQL(url);
  await db.unsafe(resetSql);
  await db.unsafe(schemaSql);
  for (const file of migrationFiles) {
    await db.unsafe(await Bun.file(path.join(migrationsDir, file)).text());
  }
  await db.close();
}

export const hasTestDatabase = (): boolean => Boolean(getTestDatabaseUrl());
