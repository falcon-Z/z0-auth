import { SQL } from "bun";

import { loadConfig } from "./config";
import { createPgSql } from "./create-pg-sql";

export type DatabaseHealth = {
  ok: boolean;
  configured: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
};

/** Survives `bun --hot` reloads so old pools are not left open on the server. */
const GLOBAL_DB_KEY = "__z0_auth_pg_sql__";

const CONNECTION_ERROR_CODES = new Set([
  "ERR_POSTGRES_CONNECTION_CLOSED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
]);

function globalDbSlot(): typeof globalThis & Record<typeof GLOBAL_DB_KEY, SQL | undefined> {
  return globalThis as typeof globalThis & Record<typeof GLOBAL_DB_KEY, SQL | undefined>;
}

export function isDatabaseConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  if (code && CONNECTION_ERROR_CODES.has(code)) return true;
  const message = error.message.toLowerCase();
  return (
    message.includes("connection closed") ||
    message.includes("connection refused") ||
    message.includes("connect econnrefused") ||
    message.includes("socket hang up") ||
    message.includes("too many clients")
  );
}

export async function resetDatabaseConnection(): Promise<void> {
  await closeDatabase();
}

/** Lazily initialize the Postgres client from DATABASE_URL. */
export function getDb(): SQL {
  const slot = globalDbSlot();
  if (!slot[GLOBAL_DB_KEY]) {
    const { databaseUrl } = loadConfig();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not configured");
    }
    slot[GLOBAL_DB_KEY] = createPgSql(databaseUrl);
  }
  return slot[GLOBAL_DB_KEY]!;
}

/** Tagged template helper bound to the app database connection. */
export function query(strings: TemplateStringsArray, ...values: unknown[]) {
  return getDb()(strings, ...values);
}

/** PostgreSQL `TEXT[]` parameter for Bun SQL (see bun.com/docs/runtime/sql#sql-array-helper). */
export function pgTextArray(values: string[]) {
  return getDb().array(values, "TEXT");
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const started = performance.now();
  const { databaseUrl } = loadConfig();
  if (!databaseUrl) {
    return {
      ok: false,
      configured: false,
      latencyMs: 0,
      error: "DATABASE_URL is not set",
    };
  }

  try {
    const [row] = await getDb()`SELECT version() AS version`;
    return {
      ok: true,
      configured: true,
      latencyMs: Math.round(performance.now() - started),
      version: String((row as { version: string }).version),
    };
  } catch (error) {
    if (isDatabaseConnectionError(error)) await resetDatabaseConnection();
    return {
      ok: false,
      configured: true,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closeDatabase(): Promise<void> {
  const slot = globalDbSlot();
  const existing = slot[GLOBAL_DB_KEY];
  if (existing) {
    await existing.close();
    delete slot[GLOBAL_DB_KEY];
  }
}
