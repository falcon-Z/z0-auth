#!/usr/bin/env bun
/**
 * Creates the integration-test database on the same Postgres instance as dev.
 * Usage: bun run db:test:init
 */

import { SQL } from "bun";
import path from "node:path";

import { loadEnvFile, loadRootEnv } from "../lib/load-root-env";

loadRootEnv();
loadEnvFile(path.join(import.meta.dir, "../../.env.test"));

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) {
  console.error("TEST_DATABASE_URL is required (see .env.test).");
  process.exit(1);
}

function databaseNameFromUrl(url: string): string {
  const parsed = new URL(url.replace(/^postgresql:/, "http:"));
  const name = parsed.pathname.replace(/^\//, "");
  if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid database name in TEST_DATABASE_URL: ${name || "(empty)"}`);
  }
  return name;
}

function adminUrlFromDatabaseUrl(url: string): string {
  const parsed = new URL(url.replace(/^postgresql:/, "http:"));
  parsed.pathname = "/postgres";
  return parsed.toString().replace(/^http:/, "postgresql:");
}

const databaseName = databaseNameFromUrl(testDatabaseUrl);
const adminUrl = adminUrlFromDatabaseUrl(testDatabaseUrl);

const db = new SQL(adminUrl);
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
