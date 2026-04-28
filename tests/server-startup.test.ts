import { describe, expect, mock, test } from 'bun:test';
import { ensureServerStartupReadiness } from '../src/server-startup';

describe('ensureServerStartupReadiness', () => {
  test('checks database readiness before server start', async () => {
    const ensureDatabaseReady = mock(async () => ({
      appliedMigrations: 0,
      totalMigrations: 11,
    }));
    const info = mock(() => undefined);

    const result = await ensureServerStartupReadiness({
      ensureDatabaseReady,
      logger: { info },
    });

    expect(ensureDatabaseReady).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ appliedMigrations: 0, totalMigrations: 11 });
    expect(info).toHaveBeenNthCalledWith(1, 'Checking database connectivity and migrations before server start');
    expect(info).toHaveBeenNthCalledWith(2, 'Database ready', {
      appliedMigrations: 0,
      totalMigrations: 11,
    });
  });
});
