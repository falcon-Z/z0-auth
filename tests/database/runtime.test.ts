import { describe, expect, mock, test } from 'bun:test';
import {
  ensureDatabaseReady,
  pingDatabase,
  type DatabaseClient,
} from '../../database/runtime';
import type { AppliedMigration, Migration } from '../../database/migration-runner';

function createMockClient(): DatabaseClient & {
  unsafe: ReturnType<typeof mock>;
  close: ReturnType<typeof mock>;
} {
  return {
    unsafe: mock(async () => [{ connection_ok: 1 }]),
    close: mock(async () => undefined),
  };
}

describe('pingDatabase', () => {
  test('runs a lightweight connectivity query', async () => {
    const client = createMockClient();

    await pingDatabase(client);

    expect(client.unsafe).toHaveBeenCalledWith('SELECT 1 AS connection_ok');
  });
});

describe('ensureDatabaseReady', () => {
  test('checks connectivity and applies pending migrations before startup', async () => {
    const client = createMockClient();
    const migrations: Migration[] = [
      { version: 1, name: 'bootstrap', fileName: '0001_bootstrap.sql', sql: 'SELECT 1;' },
      { version: 2, name: 'tenancy', fileName: '0002_tenancy.sql', sql: 'SELECT 2;' },
    ];
    const applied: AppliedMigration[] = [
      {
        version: 1,
        name: 'bootstrap',
        checksum: 'abc',
        applied_at: new Date().toISOString(),
      },
    ];

    const ensureMigrationsTableMock = mock(async () => undefined);
    const getAppliedMigrationsMock = mock(async () => applied);
    const assertNoDriftMock = mock(() => undefined);
    const applyPendingMigrationsMock = mock(async () => 1);

    const result = await ensureDatabaseReady({
      resolveDatabaseUrl: () => 'postgres://example',
      createClient: () => client,
      loadMigrations: async () => migrations,
      ensureMigrationsTable: ensureMigrationsTableMock,
      getAppliedMigrations: getAppliedMigrationsMock,
      assertNoDrift: assertNoDriftMock,
      applyPendingMigrations: applyPendingMigrationsMock,
      migrationsDir: '/tmp/migrations',
    });

    expect(result).toEqual({ appliedMigrations: 1, totalMigrations: 2 });
    expect(client.unsafe).toHaveBeenCalledWith('SELECT 1 AS connection_ok');
    expect(ensureMigrationsTableMock).toHaveBeenCalledWith(client);
    expect(getAppliedMigrationsMock).toHaveBeenCalledWith(client);
    expect(assertNoDriftMock).toHaveBeenCalledWith(migrations, applied);
    expect(applyPendingMigrationsMock).toHaveBeenCalledWith(client, migrations, applied);
    expect(client.close).toHaveBeenCalled();
  });

  test('always closes the client when startup fails', async () => {
    const client = createMockClient();
    const startupError = new Error('database unavailable');
    client.unsafe = mock(async () => {
      throw startupError;
    });

    await expect(
      ensureDatabaseReady({
        resolveDatabaseUrl: () => 'postgres://example',
        createClient: () => client,
      })
    ).rejects.toThrow('database unavailable');

    expect(client.close).toHaveBeenCalled();
  });
});
