#!/usr/bin/env bun
/**
 * Creates the integration-test database on the same Postgres instance as dev.
 * Usage: bun run db:test:init  (NODE_ENV=test — reads DATABASE_URL from .env.test)
 */

import { createPgSql } from "../api/lib/create-pg-sql";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required (see .env.test when NODE_ENV=test).");
  process.exit(1);
}

function databaseNameFromUrl(url: string): string {
  const parsed = new URL(url.replace(/^postgresql:/, "http:"));
  const name = parsed.pathname.replace(/^\//, "");
  if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid database name in DATABASE_URL: ${name || "(empty)"}`);
  }
  return name;
}

function adminUrlFromDatabaseUrl(url: string): string {
  const parsed = new URL(url.replace(/^postgresql:/, "http:"));
  parsed.pathname = "/postgres";
  return parsed.toString().replace(/^http:/, "postgresql:");
}

const databaseName = databaseNameFromUrl(databaseUrl);
const adminUrl = adminUrlFromDatabaseUrl(databaseUrl);

const db = createPgSql(adminUrl);
const existing = await db`
  SELECT 1 AS ok FROM pg_database WHERE datname = ${databaseName}
`;

if (existing.length > 0) {
  console.log(`Test database "${databaseName}" already exists.`);
} else {
  await db.unsafe(`CREATE DATABASE ${databaseName}`);
  console.log(`Created test database "${databaseName}".`);
}

await db.close();
