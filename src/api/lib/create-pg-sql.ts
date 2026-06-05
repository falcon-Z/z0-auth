import { SQL } from "bun";

/**
 * Postgres client for this app. Bun defaults to max 10 connections per pool
 * (eager). A single Bun process only needs one connection; tests + dev --hot
 * otherwise exhaust Docker Postgres max_connections quickly.
 */
export function createPgSql(connectionString: string | URL): SQL {
  return new SQL(connectionString, {
    max: 1,
    idleTimeout: 30,
  });
}
