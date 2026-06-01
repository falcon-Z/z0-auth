import { SQL } from "bun";

import { loadConfig } from "./config";

export type DatabaseHealth = {
  ok: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
};

let db: SQL | null = null;

const CONNECTION_ERROR_CODES = new Set([
  "ERR_POSTGRES_CONNECTION_CLOSED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
]);

export function isDatabaseConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  if (code && CONNECTION_ERROR_CODES.has(code)) return true;
  const message = error.message.toLowerCase();
  return (
    message.includes("connection closed") ||
    message.includes("connection refused") ||
    message.includes("connect econnrefused") ||
    message.includes("socket hang up")
  );
}

export async function resetDatabaseConnection(): Promise<void> {
  await closeDatabase();
}

/** Lazily initialize the Postgres client from DATABASE_URL. */
export function getDb(): SQL {
  if (!db) {
    const { databaseUrl } = loadConfig();
    db = new SQL(databaseUrl);
  }
  return db;
}

/** Tagged template helper bound to the app database connection. */
export function query(strings: TemplateStringsArray, ...values: unknown[]) {
  return getDb()(strings, ...values);
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const started = performance.now();
  try {
    const [row] = await getDb()`SELECT version() AS version`;
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      version: String((row as { version: string }).version),
    };
  } catch (error) {
    if (isDatabaseConnectionError(error)) await resetDatabaseConnection();
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
