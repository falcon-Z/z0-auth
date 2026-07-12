import { afterAll, describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { closeDatabase } from "../../src/api/lib/db";
import { createPgSql } from "../../src/api/lib/create-pg-sql";
import { applyMigrations } from "../../src/scripts/migrations";
import { databaseNameFromUrl, hasTestDatabase, resetTestDatabase } from "../helpers/db";

const run = hasTestDatabase() ? describe : describe.skip;
const migrationsDir = path.join(import.meta.dir, "..", "..", "src", "scripts", "sql", "migrations");

async function checksum(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Buffer.from(digest).toString("hex");
}

run("migration release integrity", () => {
  afterAll(async () => {
    await closeDatabase();
  });

  test("fresh migrations are complete, checksummed, and idempotent", async () => {
    const databaseUrl = process.env.DATABASE_URL!;
    expect(databaseNameFromUrl(databaseUrl).endsWith("_test")).toBe(true);
    await resetTestDatabase();

    const db = createPgSql(databaseUrl);
    try {
      expect(await applyMigrations(db, migrationsDir, false)).toBe(0);

      const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
      const expected = new Map<string, string>();
      for (const file of files) {
        expected.set(file.replace(/\.sql$/, ""), await checksum(await Bun.file(path.join(migrationsDir, file)).text()));
      }
      const rows = await db`SELECT version, checksum FROM schema_migrations ORDER BY version`;
      expect(rows).toHaveLength(expected.size + 1);
      for (const row of rows) {
        const version = String((row as { version: string }).version);
        if (version === "0001_baseline") {
          expect((row as { checksum: string | null }).checksum).toBeNull();
        } else {
          expect((row as { checksum: string }).checksum).toBe(expected.get(version));
        }
      }
    } finally {
      await db.close();
    }
  });
});
