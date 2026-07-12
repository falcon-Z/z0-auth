import { readdir } from "node:fs/promises";
import path from "node:path";
import type { SQL } from "bun";

async function checksumSql(sql: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sql));
  return Buffer.from(digest).toString("hex");
}

export async function applyMigrations(
  db: SQL,
  migrationsDir = path.join(import.meta.dir, "sql", "migrations"),
  log = true,
): Promise<number> {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  return db.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('z0-auth:schema-migrations'))`;
    await tx`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        checksum TEXT,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await tx`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT`;

    const appliedRows = await tx`SELECT version, checksum FROM schema_migrations`;
    const applied = new Map(
      appliedRows.map((row) => [
        String((row as { version: string }).version),
        (row as { checksum: string | null }).checksum,
      ]),
    );
    let count = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const migrationSql = await Bun.file(path.join(migrationsDir, file)).text();
      const checksum = await checksumSql(migrationSql);
      const priorChecksum = applied.get(version);
      if (priorChecksum !== undefined) {
        if (priorChecksum && priorChecksum !== checksum) {
          throw new Error(`Applied migration ${version} has been modified`);
        }
        if (!priorChecksum) {
          await tx`UPDATE schema_migrations SET checksum = ${checksum} WHERE version = ${version}`;
        }
        continue;
      }

      if (log) console.log(`Applying migration ${file}…`);
      await tx.unsafe(migrationSql);
      await tx`
        INSERT INTO schema_migrations (version, checksum)
        VALUES (${version}, ${checksum})
        ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum
      `;
      count += 1;
    }
    return count;
  });
}

export async function resetAndMigrateDatabase(
  db: SQL,
  sqlDir = path.join(import.meta.dir, "sql"),
  log = true,
): Promise<number> {
  await db.unsafe(await Bun.file(path.join(sqlDir, "reset.sql")).text());
  await db.unsafe(await Bun.file(path.join(sqlDir, "schema.sql")).text());
  return applyMigrations(db, path.join(sqlDir, "migrations"), log);
}
