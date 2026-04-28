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

async function run(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  const db = new SQL(databaseUrl);

  try {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    await ensureMigrationsTable(db);

    const applied = await getAppliedMigrations(db);
    assertNoDrift(migrations, applied);

    const count = await applyPendingMigrations(db, migrations, applied);

    console.log(`Migrations complete. Applied ${count} migration(s).`);
  } finally {
    await db.close();
  }
}

await run();
