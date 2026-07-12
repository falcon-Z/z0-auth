#!/usr/bin/env bun
/**
 * Applies pending SQL migrations (does not drop data).
 * Usage: bun run db:migrate
 */

import { createPgSql } from "../api/lib/create-pg-sql";
import { applyMigrations } from "./migrations";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const db = createPgSql(databaseUrl);
const count = await applyMigrations(db);

await db.close();

if (count === 0) {
  console.log("No pending migrations.");
} else {
  console.log(`Applied ${count} migration(s).`);
}
