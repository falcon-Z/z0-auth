import { SQL } from "bun";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { closeDatabase } from "../../packages/server/src/api/lib/db";

export function getTestDatabaseUrl(): string | null {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
}

export async function resetTestDatabase(): Promise<void> {
  const url = getTestDatabaseUrl();
  if (!url) return;

  await closeDatabase();

  const sqlDir = path.join(import.meta.dir, "../../scripts/sql");
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
