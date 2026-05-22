#!/usr/bin/env bun
/**
 * Drops and recreates the public schema, applies baseline, then ordered migrations.
 * Usage: bun run db:reset
 */

import { SQL } from "bun";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { loadRootEnv } from "../src/lib/load-root-env";

loadRootEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  console.error("Create a .env at the repo root (see .env.example) or export DATABASE_URL.");
  process.exit(1);
}

const sqlDir = path.join(import.meta.dir, "sql");
const migrationsDir = path.join(sqlDir, "migrations");

const resetSql = await Bun.file(path.join(sqlDir, "reset.sql")).text();
const schemaSql = await Bun.file(path.join(sqlDir, "schema.sql")).text();

const db = new SQL(databaseUrl);

console.log("Resetting database (DROP SCHEMA public CASCADE)…");
await db.unsafe(resetSql);

console.log("Applying baseline schema…");
await db.unsafe(schemaSql);

const migrationFiles = (await readdir(migrationsDir))
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of migrationFiles) {
  const migrationSql = await Bun.file(path.join(migrationsDir, file)).text();
  console.log(`Applying migration ${file}…`);
  await db.unsafe(migrationSql);
}

await db.close();
console.log("Database reset complete.");
