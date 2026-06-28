#!/usr/bin/env bun
/**
 * Applies pending SQL migrations (does not drop data).
 * Usage: bun run db:migrate
 */

import { readdir } from "node:fs/promises";
import path from "node:path";

import { createPgSql } from "../api/lib/create-pg-sql";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const migrationsDir = path.join(import.meta.dir, "sql", "migrations");
const db = createPgSql(databaseUrl);

const appliedRows = await db`SELECT version FROM schema_migrations`;
const applied = new Set(appliedRows.map((r) => String((r as { version: string }).version)));

const migrationFiles = (await readdir(migrationsDir))
  .filter((f) => f.endsWith(".sql"))
  .sort();

let count = 0;
for (const file of migrationFiles) {
  const version = file.replace(/\.sql$/, "");
  if (applied.has(version)) continue;

  const migrationSql = await Bun.file(path.join(migrationsDir, file)).text();
  console.log(`Applying migration ${file}…`);
  await db.unsafe(migrationSql);
  count += 1;
}

await db.close();

if (count === 0) {
  console.log("No pending migrations.");
} else {
  console.log(`Applied ${count} migration(s).`);
}
