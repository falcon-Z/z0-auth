import { afterAll, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase } from "../../src/api/lib/db";
import { createPgSql } from "../../src/api/lib/create-pg-sql";
import {
  applyMigrations,
  resetAndMigrateDatabase,
} from "../../src/scripts/migrations";
import { hasTestDatabase } from "../helpers/db";
const run = hasTestDatabase() ? describe : describe.skip;
const sqlDir = path.join(import.meta.dir, "../../src/scripts/sql");
run("Application/Client upgrade", () => {
  afterAll(closeDatabase);
  test("preserves IDs, identity ownership, scopes and explicit operator grants; retires unclassified protocol authority", async () => {
    await closeDatabase();
    const previous = await mkdtemp(
      path.join(tmpdir(), "z0-clients-migration-"),
    );
    const db = createPgSql(process.env.DATABASE_URL!);
    try {
      await mkdir(path.join(previous, "migrations"));
      for (const file of ["schema.sql", "reset.sql"])
        await copyFile(path.join(sqlDir, file), path.join(previous, file));
      for (const file of await readdir(path.join(sqlDir, "migrations")))
        if (file.endsWith(".sql") && file < "0046")
          await copyFile(
            path.join(sqlDir, "migrations", file),
            path.join(previous, "migrations", file),
          );
      await resetAndMigrateDatabase(db, previous, false);
      const [app] =
        await db`INSERT INTO apps (name, slug, client_type, redirect_uris) VALUES ('Product', 'product', 'confidential', ARRAY['https://example.com/callback']) RETURNING *`;
      const [client] =
        await db`INSERT INTO app_credentials (app_id, client_id, client_secret_hash, label) VALUES (${app.id}, 'existing-client', 'existing-verifier', 'Server') RETURNING *`;
      const [user] =
        await db`INSERT INTO app_users (app_id, email, name) VALUES (${app.id}, 'person@example.com', 'Person') RETURNING id, account_id`;
      await db`INSERT INTO app_scopes (app_id, name) VALUES (${app.id}, 'openid')`;
      await db`INSERT INTO oauth_refresh_tokens (token_hash, app_id, app_user_id, app_credential_id, expires_at) VALUES ('refresh', ${app.id}, ${user.id}, ${client.id}, NOW() + INTERVAL '1 hour')`;
      await db`INSERT INTO oauth_access_tokens (token_hash, app_id, app_credential_id, expires_at) VALUES ('machine', ${app.id}, ${client.id}, NOW() + INTERVAL '1 hour')`;
      const [role] =
        await db`INSERT INTO instance_roles (key, name) VALUES ('integration-manager', 'Integration manager') RETURNING id`;
      await db`INSERT INTO instance_role_scopes (role_id, scope_key) VALUES (${role.id}, 'apps.credentials:create')`;
      expect(
        await applyMigrations(db, path.join(sqlDir, "migrations"), false),
      ).toBe(3);
      const [child] =
        await db`SELECT * FROM oauth_clients WHERE id = ${client.id}`;
      expect(child.client_id).toBe("existing-client");
      expect(child.app_id).toBe(app.id);
      expect(child.client_secret_hash).toBe("existing-verifier");
      expect(child.client_type).toBe("confidential");
      expect(child.redirect_uris).toEqual(["https://example.com/callback"]);
      expect(child.purpose).toBe("interactive");
      expect(child.browser_origins).toEqual([]);
      expect(child.refresh_enabled).toBe(false);
      const [preserved] =
        await db`SELECT * FROM app_users WHERE id = ${user.id}`;
      expect(preserved.account_id).toBe(user.account_id);
      expect(preserved.membership_status).toBe("active");
      const [parent] = await db`SELECT * FROM apps WHERE id = ${app.id}`;
      expect(parent.account_domain_id).toBe(app.account_domain_id);
      expect(parent.client_type).toBeUndefined();
      expect(
        await db`SELECT name FROM app_scopes WHERE app_id = ${app.id}`,
      ).toHaveLength(1);
      expect(
        (await db`SELECT revoked_at FROM oauth_refresh_tokens`)[0].revoked_at,
      ).not.toBeNull();
      expect(
        (await db`SELECT revoked_at FROM oauth_access_tokens`)[0].revoked_at,
      ).not.toBeNull();
      const grants =
        await db`SELECT scope_key FROM instance_role_scopes WHERE role_id = ${role.id}`;
      expect(
        grants.map((r: { scope_key: string }) => r.scope_key).sort(),
      ).toEqual(["apps.clients:create"]);
      expect(
        await applyMigrations(db, path.join(sqlDir, "migrations"), false),
      ).toBe(0);
    } finally {
      await db.close();
      await rm(previous, { recursive: true, force: true });
    }
  }, 15_000);
});
