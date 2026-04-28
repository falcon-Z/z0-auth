import { describe, expect, test } from 'bun:test';
import {
  assertContiguousVersions,
  assertNoDrift,
  parseMigrationFilename,
  sha256,
  type Migration,
  type AppliedMigration,
} from '../../database/migration-runner';

describe('parseMigrationFilename', () => {
  test('parses valid migration file names', () => {
    const parsed = parseMigrationFilename('0007_rate_limit.sql');
    expect(parsed.version).toBe(7);
    expect(parsed.name).toBe('rate_limit');
  });

  test('throws on invalid file names', () => {
    expect(() => parseMigrationFilename('7_rate_limit.sql')).toThrow();
    expect(() => parseMigrationFilename('0001-foo.sql')).toThrow();
    expect(() => parseMigrationFilename('readme.md')).toThrow();
  });
});

describe('assertContiguousVersions', () => {
  test('passes for contiguous migration versions', () => {
    const migrations: Migration[] = [
      { version: 1, name: 'bootstrap', fileName: '0001_bootstrap.sql', sql: 'SELECT 1;' },
      { version: 2, name: 'tenancy', fileName: '0002_tenancy.sql', sql: 'SELECT 2;' },
      { version: 3, name: 'apps', fileName: '0003_apps.sql', sql: 'SELECT 3;' },
    ];

    expect(() => assertContiguousVersions(migrations)).not.toThrow();
  });

  test('fails on missing sequence values', () => {
    const migrations: Migration[] = [
      { version: 1, name: 'bootstrap', fileName: '0001_bootstrap.sql', sql: 'SELECT 1;' },
      { version: 3, name: 'apps', fileName: '0003_apps.sql', sql: 'SELECT 3;' },
    ];

    expect(() => assertContiguousVersions(migrations)).toThrow();
  });
});

describe('assertNoDrift', () => {
  test('passes when applied and filesystem migrations match', () => {
    const migrations: Migration[] = [
      { version: 1, name: 'bootstrap', fileName: '0001_bootstrap.sql', sql: 'CREATE TABLE x();' },
    ];

    const applied: AppliedMigration[] = [
      {
        version: 1,
        name: 'bootstrap',
        checksum: sha256('CREATE TABLE x();'),
        applied_at: new Date().toISOString(),
      },
    ];

    expect(() => assertNoDrift(migrations, applied)).not.toThrow();
  });

  test('fails when checksum changes', () => {
    const migrations: Migration[] = [
      { version: 1, name: 'bootstrap', fileName: '0001_bootstrap.sql', sql: 'CREATE TABLE x();' },
    ];

    const applied: AppliedMigration[] = [
      {
        version: 1,
        name: 'bootstrap',
        checksum: sha256('CREATE TABLE y();'),
        applied_at: new Date().toISOString(),
      },
    ];

    expect(() => assertNoDrift(migrations, applied)).toThrow();
  });

  test('fails when applied migration is not present in files', () => {
    const migrations: Migration[] = [];
    const applied: AppliedMigration[] = [
      {
        version: 1,
        name: 'bootstrap',
        checksum: sha256('CREATE TABLE x();'),
        applied_at: new Date().toISOString(),
      },
    ];

    expect(() => assertNoDrift(migrations, applied)).toThrow();
  });
});
