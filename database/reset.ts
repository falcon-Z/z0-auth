import { SQL } from 'bun';
import {
  applyPendingMigrations,
  assertNoDrift,
  ensureMigrationsTable,
  getAppliedMigrations,
  loadMigrations,
  resolveDatabaseUrl,
} from './migration-runner';

const MIGRATIONS_DIR = `${import.meta.dir}/migrations`;

export async function resetDatabase(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  const db = new SQL(databaseUrl);

  try {
    await db.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await db.unsafe('CREATE SCHEMA public');
    await db.unsafe('GRANT ALL ON SCHEMA public TO public');
    await db.unsafe('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    const migrations = await loadMigrations(MIGRATIONS_DIR);
    await ensureMigrationsTable(db);
    const applied = await getAppliedMigrations(db);
    assertNoDrift(migrations, applied);

    const count = await applyPendingMigrations(db, migrations, applied);
    console.log(`Database reset complete. Applied ${count} migration(s).`);
  } finally {
    await db.close();
  }
}

await resetDatabase();
