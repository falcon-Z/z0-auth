import { SQL } from "bun";

import { loadConfig } from "./config";

export type DatabaseHealth = {
  ok: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
};

let db: SQL | null = null;

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
