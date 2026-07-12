#!/usr/bin/env bun
/**
 * Drops and recreates the public schema, applies baseline, then ordered migrations.
 * Usage: bun run db:reset
 */

import { createPgSql } from "../api/lib/create-pg-sql";
import { resetAndMigrateDatabase } from "./migrations";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  console.error("Create a .env at the repo root (see .env.example) or export DATABASE_URL.");
  process.exit(1);
}

const db = createPgSql(databaseUrl);

console.log("Resetting database (DROP SCHEMA public CASCADE)…");
await resetAndMigrateDatabase(db);

await db.close();
console.log("Database reset complete.");
