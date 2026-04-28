import { SQL } from 'bun';
import {
  applyPendingMigrations,
  assertNoDrift,
  ensureMigrationsTable,
  getAppliedMigrations,
  loadMigrations,
  resolveDatabaseUrl,
  type AppliedMigration,
  type Migration,
} from './migration-runner';

export interface DatabaseClient {
  unsafe(sql: string, params?: unknown[]): Promise<unknown>;
  close(): Promise<void>;
}

export interface DatabaseStartupResult {
  appliedMigrations: number;
  totalMigrations: number;
}

export interface DatabaseStartupDependencies {
  resolveDatabaseUrl?: () => string;
  createClient?: (databaseUrl: string) => DatabaseClient;
  loadMigrations?: (migrationsDir: string) => Promise<Migration[]>;
  ensureMigrationsTable?: (db: DatabaseClient) => Promise<void>;
  getAppliedMigrations?: (db: DatabaseClient) => Promise<AppliedMigration[]>;
  assertNoDrift?: (migrations: Migration[], applied: AppliedMigration[]) => void;
  applyPendingMigrations?: (db: DatabaseClient, migrations: Migration[], applied: AppliedMigration[]) => Promise<number>;
  migrationsDir?: string;
}

export const DEFAULT_MIGRATIONS_DIR = `${import.meta.dir}/migrations`;

export function createDatabaseClient(databaseUrl: string): SQL {
  return new SQL({
    url: databaseUrl,
    max: 1,
    idleTimeout: 5,
    connectionTimeout: 10,
  });
}

export async function pingDatabase(db: DatabaseClient): Promise<void> {
  await db.unsafe('SELECT 1 AS connection_ok');
}

export interface DatabaseReadinessStatus {
  connected: boolean;
  migrations: {
    applied: number;
    total: number;
    pending: number;
  };
}

/**
 * Check database readiness without making changes
 * Used by readiness endpoint to report current DB state
 */
export async function checkDatabaseReadiness(
  dependencies: DatabaseStartupDependencies = {}
): Promise<DatabaseReadinessStatus> {
  const resolveUrl = dependencies.resolveDatabaseUrl ?? resolveDatabaseUrl;
  const clientFactory = dependencies.createClient ?? createDatabaseClient;
  const load = dependencies.loadMigrations ?? loadMigrations;
  const ensureTable = dependencies.ensureMigrationsTable ?? ensureMigrationsTable;
  const getApplied = dependencies.getAppliedMigrations ?? getAppliedMigrations;
  const migrationsDir = dependencies.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;

  const databaseUrl = resolveUrl();
  const db = clientFactory(databaseUrl);

  try {
    await pingDatabase(db);
    const migrations = await load(migrationsDir);
    await ensureTable(db);
    const applied = await getApplied(db);

    const pending = migrations.length - applied.length;

    return {
      connected: true,
      migrations: {
        applied: applied.length,
        total: migrations.length,
        pending,
      },
    };
  } catch (_error) {
    return {
      connected: false,
      migrations: {
        applied: 0,
        total: 0,
        pending: 0,
      },
    };
  } finally {
    await db.close();
  }
}

export async function ensureDatabaseReady(
  dependencies: DatabaseStartupDependencies = {}
): Promise<DatabaseStartupResult> {
  const resolveUrl = dependencies.resolveDatabaseUrl ?? resolveDatabaseUrl;
  const clientFactory = dependencies.createClient ?? createDatabaseClient;
  const load = dependencies.loadMigrations ?? loadMigrations;
  const ensureTable = dependencies.ensureMigrationsTable ?? ensureMigrationsTable;
  const getApplied = dependencies.getAppliedMigrations ?? getAppliedMigrations;
  const assertDrift = dependencies.assertNoDrift ?? assertNoDrift;
  const applyPending = dependencies.applyPendingMigrations ?? applyPendingMigrations;
  const migrationsDir = dependencies.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;

  const databaseUrl = resolveUrl();
  const db = clientFactory(databaseUrl);

  try {
    await pingDatabase(db);
    const migrations = await load(migrationsDir);
    await ensureTable(db);
    const applied = await getApplied(db);
    assertDrift(migrations, applied);
    const appliedMigrations = await applyPending(db, migrations, applied);

    return {
      appliedMigrations,
      totalMigrations: migrations.length,
    };
  } finally {
    await db.close();
  }
}
