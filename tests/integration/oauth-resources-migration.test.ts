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
run("Resource authority upgrade", () => {
  afterAll(closeDatabase);
  test("resets unbound protocol state without inventing Resource permissions or merging identities", async () => {
    await closeDatabase();
    const previous = await mkdtemp(
      path.join(tmpdir(), "z0-resources-upgrade-"),
    );
    const db = createPgSql(process.env.DATABASE_URL!);
    try {
      await mkdir(path.join(previous, "migrations"));
      for (const file of ["schema.sql", "reset.sql"])
        await copyFile(path.join(sqlDir, file), path.join(previous, file));
      for (const file of await readdir(path.join(sqlDir, "migrations")))
        if (file.endsWith(".sql") && file < "0047")
          await copyFile(
            path.join(sqlDir, "migrations", file),
            path.join(previous, "migrations", file),
          );
      await resetAndMigrateDatabase(db, previous, false);
      const [app] =
        await db`INSERT INTO apps(name, slug) VALUES ('Existing', 'existing') RETURNING id, account_domain_id`;
      const [client] =
        await db`INSERT INTO oauth_clients(app_id, client_id, label, client_type, client_secret_hash, purpose, redirect_uris, refresh_enabled) VALUES (${app.id}, 'stable-client', 'Server', 'confidential', 'existing-verifier', 'interactive', ARRAY['https://example.com/callback'], TRUE) RETURNING id`;
      const [user] =
        await db`INSERT INTO app_users(app_id, email, name) VALUES (${app.id}, 'person@example.com', 'Person') RETURNING id, account_id`;
      await db`INSERT INTO app_scopes(app_id, name) VALUES (${app.id}, 'read')`;
      await db`INSERT INTO oauth_authorization_codes(code_hash, app_id, app_user_id, app_credential_id, redirect_uri, scope, expires_at) VALUES ('code', ${app.id}, ${user.id}, ${client.id}, 'https://example.com/callback', 'read', NOW() + INTERVAL '1 hour')`;
      await db`INSERT INTO oauth_consent_challenges(nonce_hash, app_id, app_user_id, app_credential_id, redirect_uri, scope, expires_at) VALUES ('challenge', ${app.id}, ${user.id}, ${client.id}, 'https://example.com/callback', 'read', NOW() + INTERVAL '1 hour')`;
      await db`INSERT INTO oauth_access_tokens(token_hash, app_id, app_user_id, app_credential_id, scope, expires_at) VALUES ('access', ${app.id}, ${user.id}, ${client.id}, 'read', NOW() + INTERVAL '1 hour')`;
      await db`INSERT INTO oauth_refresh_tokens(token_hash, app_id, app_user_id, app_credential_id, scope, expires_at, retry_key_hash, retry_response_ciphertext, retry_expires_at) VALUES ('refresh', ${app.id}, ${user.id}, ${client.id}, 'read', NOW() + INTERVAL '1 hour', 'retry', 'ciphertext', NOW() + INTERVAL '1 hour')`;
      const [role] =
        await db`INSERT INTO instance_roles(key, name) VALUES ('resource-editor', 'Editor') RETURNING id`;
      await db`INSERT INTO instance_role_scopes(role_id, scope_key) VALUES (${role.id}, 'apps.scopes:read'), (${role.id}, 'apps.scopes:manage')`;
      expect(
        await applyMigrations(db, path.join(sqlDir, "migrations"), false),
      ).toBe(1);
      expect(await db`SELECT id FROM oauth_resources`).toHaveLength(0);
      expect(
        await db`SELECT client_id FROM client_resource_permissions`,
      ).toHaveLength(0);
      expect(await db`SELECT id FROM oauth_grants`).toHaveLength(0);
      expect(
        (await db`SELECT used_at FROM oauth_authorization_codes`)[0].used_at,
      ).not.toBeNull();
      expect(
        (await db`SELECT consumed_at FROM oauth_consent_challenges`)[0]
          .consumed_at,
      ).not.toBeNull();
      expect(
        (await db`SELECT revoked_at FROM oauth_access_tokens`)[0].revoked_at,
      ).not.toBeNull();
      const [refresh] =
        await db`SELECT revoked_at, retry_response_ciphertext, resource_id, grant_id FROM oauth_refresh_tokens`;
      expect(refresh.revoked_at).not.toBeNull();
      expect(refresh.retry_response_ciphertext).toBeNull();
      expect(refresh.resource_id).toBeNull();
      expect(refresh.grant_id).toBeNull();
      const [preserved] =
        await db`SELECT account_id FROM app_users WHERE id = ${user.id}`;
      expect(preserved.account_id).toBe(user.account_id);
      expect(
        (await db`SELECT account_domain_id FROM apps WHERE id = ${app.id}`)[0]
          .account_domain_id,
      ).toBe(app.account_domain_id);
      expect(
        (
          await db`SELECT client_id FROM oauth_clients WHERE id = ${client.id}`
        )[0].client_id,
      ).toBe("stable-client");
      expect(
        (await db`SELECT name FROM app_scopes WHERE app_id = ${app.id}`)[0]
          .name,
      ).toBe("read");
      expect(
        (
          await db`SELECT scope_key FROM instance_role_scopes WHERE role_id = ${role.id} AND scope_key LIKE 'apps.resources:%' ORDER BY scope_key`
        ).map((r: { scope_key: string }) => r.scope_key),
      ).toEqual(["apps.resources:manage", "apps.resources:read"]);
      expect(
        await applyMigrations(db, path.join(sqlDir, "migrations"), false),
      ).toBe(0);
    } finally {
      await db.close();
      await rm(previous, { recursive: true, force: true });
    }
  }, 20_000);
});
