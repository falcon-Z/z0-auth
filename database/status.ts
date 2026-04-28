import { SQL } from 'bun';
import {
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

    const appliedVersions = new Set(applied.map((m) => m.version));
    const pending = migrations.filter((m) => !appliedVersions.has(m.version));

    console.log(`Total migrations: ${migrations.length}`);
    console.log(`Applied: ${applied.length}`);
    console.log(`Pending: ${pending.length}`);

    if (pending.length > 0) {
      console.log('Pending migration files:');
      for (const migration of pending) {
        console.log(`- ${migration.fileName}`);
      }
    }
  } finally {
    await db.close();
  }
}

await run();
