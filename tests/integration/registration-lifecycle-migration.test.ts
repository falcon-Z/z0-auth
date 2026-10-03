import { afterAll, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase } from "../../src/api/lib/db";
import { createPgSql } from "../../src/api/lib/create-pg-sql";
import { applyMigrations, resetAndMigrateDatabase } from "../../src/scripts/migrations";
import { hasTestDatabase } from "../helpers/db";
const run = hasTestDatabase() ? describe : describe.skip;
const sqlDir = path.join(import.meta.dir, "../../src/scripts/sql");
run("Registration lifecycle upgrade", () => {
  afterAll(closeDatabase);
  test("preserves active/disabled identities, Resource authority and existing permissions without granting delete to editors", async () => {
    await closeDatabase();
    const previous = await mkdtemp(path.join(tmpdir(), "z0-lifecycle-upgrade-"));
    const db = createPgSql(process.env.DATABASE_URL!);
    try {
      await mkdir(path.join(previous, "migrations"));
      for (const file of ["schema.sql", "reset.sql"]) await copyFile(path.join(sqlDir, file), path.join(previous, file));
      for (const file of await readdir(path.join(sqlDir, "migrations")))
        if (file.endsWith(".sql") && file < "0048") await copyFile(path.join(sqlDir, "migrations", file), path.join(previous, "migrations", file));
      await resetAndMigrateDatabase(db, previous, false);
      const [app] = await db`INSERT INTO apps(name, slug, status, disabled_at) VALUES ('Existing', 'existing', 'disabled', NOW()) RETURNING id, account_domain_id, disabled_at`;
      const [client] = await db`INSERT INTO oauth_clients(app_id, client_id, label, client_type, purpose, redirect_uris) VALUES (${app.id}, 'stable-client', 'Browser', 'public', 'interactive', ARRAY['https://example.com/callback']) RETURNING id`;
      const [resource] = await db`INSERT INTO oauth_resources(app_id, name, audience) VALUES (${app.id}, 'API', 'urn:test:api') RETURNING id`;
      await db`INSERT INTO client_resource_permissions(client_id, resource_id) VALUES (${client.id}, ${resource.id})`;
      const [identity] = await db`INSERT INTO app_users(app_id, email, name) VALUES (${app.id}, 'person@example.com', 'Person') RETURNING account_id`;
      const [role] = await db`INSERT INTO instance_roles(key, name) VALUES ('editor-lifecycle', 'Editor') RETURNING id`;
      await db`INSERT INTO instance_role_scopes(role_id, scope_key) VALUES (${role.id}, 'apps:update'), (${role.id}, 'apps.clients:update')`;
      expect(await applyMigrations(db, path.join(sqlDir, "migrations"), false)).toBe(1);
      const [upgraded] = await db`SELECT account_domain_id, status, disabled_at, purge_after, deletion_started_at FROM apps WHERE id = ${app.id}`;
      expect(upgraded.account_domain_id).toBe(app.account_domain_id);
      expect(upgraded.status).toBe("disabled"); expect(upgraded.disabled_at).toEqual(app.disabled_at);
      expect(upgraded.purge_after).toBeNull(); expect(upgraded.deletion_started_at).toBeNull();
      expect((await db`SELECT account_id FROM app_users WHERE app_id = ${app.id}`)[0].account_id).toBe(identity.account_id);
      expect((await db`SELECT client_id, status FROM oauth_clients WHERE id = ${client.id}`)[0]).toMatchObject({ client_id: "stable-client", status: "active" });
      expect(await db`SELECT client_id FROM client_resource_permissions WHERE client_id = ${client.id}`).toHaveLength(1);
      expect(await db`SELECT client_id FROM retired_oauth_client_ids`).toHaveLength(0);
      expect(await db`SELECT scope_key FROM instance_role_scopes WHERE role_id = ${role.id} AND scope_key LIKE '%:delete'`).toHaveLength(0);
      expect(await applyMigrations(db, path.join(sqlDir, "migrations"), false)).toBe(0);
    } finally { await db.close(); await rm(previous, { recursive: true, force: true }); }
  }, 20000);
});
