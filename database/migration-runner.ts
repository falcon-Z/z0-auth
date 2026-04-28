import { SQL } from 'bun';

export interface Migration {
  version: number;
  name: string;
  fileName: string;
  sql: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
}

const MIGRATION_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export function parseMigrationFilename(fileName: string): { version: number; name: string } {
  const match = fileName.match(MIGRATION_PATTERN);
  if (!match) {
    throw new Error(`Invalid migration filename: ${fileName}`);
  }

  const version = Number.parseInt(match[1], 10);
  const name = match[2];

  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(`Invalid migration version: ${fileName}`);
  }

  return { version, name };
}

export function assertContiguousVersions(migrations: Migration[]): void {
  if (migrations.length === 0) return;

  for (let i = 0; i < migrations.length; i += 1) {
    const expected = i + 1;
    const actual = migrations[i].version;
    if (expected !== actual) {
      throw new Error(
        `Migration sequence gap detected at position ${i + 1}: expected ${expected.toString().padStart(4, '0')}, got ${actual.toString().padStart(4, '0')}`
      );
    }
  }
}

export async function loadMigrations(migrationsDir: string): Promise<Migration[]> {
  const files = Array.from(new Bun.Glob('*.sql').scanSync(migrationsDir)).sort();

  const migrations: Migration[] = [];
  for (const fileName of files) {
    const { version, name } = parseMigrationFilename(fileName);
    const sql = await Bun.file(`${migrationsDir}/${fileName}`).text();

    migrations.push({
      version,
      name,
      fileName,
      sql,
    });
  }

  migrations.sort((a, b) => a.version - b.version);
  assertContiguousVersions(migrations);

  return migrations;
}

export function sha256(input: string): string {
  const hash = Bun.hash(input);
  return hash.toString(16).padStart(16, '0');
}

export async function ensureMigrationsTable(db: SQL): Promise<void> {
  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(128) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function getAppliedMigrations(db: SQL): Promise<AppliedMigration[]> {
  const rows = await db.unsafe(`
    SELECT version, name, checksum, applied_at
    FROM schema_migrations
    ORDER BY version ASC;
  `);

  return rows as AppliedMigration[];
}

export function assertNoDrift(migrations: Migration[], applied: AppliedMigration[]): void {
  const migrationByVersion = new Map(migrations.map((m) => [m.version, m]));

  for (const row of applied) {
    const expected = migrationByVersion.get(row.version);
    if (!expected) {
      throw new Error(`Drift detected: applied migration version ${row.version} is not present in filesystem`);
    }

    if (expected.name !== row.name) {
      throw new Error(
        `Drift detected: migration ${row.version.toString().padStart(4, '0')} name mismatch (db=${row.name}, file=${expected.name})`
      );
    }

    const expectedChecksum = sha256(expected.sql);
    if (expectedChecksum !== row.checksum) {
      throw new Error(
        `Drift detected: migration ${row.version.toString().padStart(4, '0')} checksum mismatch. Migration files are immutable once applied.`
      );
    }
  }
}

export async function applyPendingMigrations(db: SQL, migrations: Migration[], applied: AppliedMigration[]): Promise<number> {
  const appliedVersions = new Set(applied.map((m) => m.version));
  let appliedCount = 0;

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    try {
      await db.begin(async (tx) => {
        await tx.unsafe(migration.sql);
        await tx.unsafe(
          `INSERT INTO schema_migrations(version, name, checksum) VALUES ($1, $2, $3)`,
          [migration.version, migration.name, sha256(migration.sql)]
        );
      });
      appliedCount += 1;
    } catch (error) {
      throw new Error(`Failed applying ${migration.fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return appliedCount;
}

export function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  return databaseUrl;
}
