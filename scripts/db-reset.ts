#!/usr/bin/env bun
/**
 * Drops and recreates the public schema, then applies the baseline schema.
 * Usage: bun run db:reset
 */

import { SQL } from "bun";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const root = path.join(import.meta.dir, "sql");
const resetSql = await Bun.file(path.join(root, "reset.sql")).text();
const schemaSql = await Bun.file(path.join(root, "schema.sql")).text();

const db = new SQL(databaseUrl);

console.log("Resetting database (DROP SCHEMA public CASCADE)…");
await db.unsafe(resetSql);

console.log("Applying baseline schema…");
await db.unsafe(schemaSql);

await db.close();
console.log("Database reset complete.");
