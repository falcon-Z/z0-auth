import { afterAll, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase } from "../../src/api/lib/db";
import { createPgSql } from "../../src/api/lib/create-pg-sql";
import { applyMigrations, resetAndMigrateDatabase } from "../../src/scripts/migrations";
import { hasTestDatabase } from "../helpers/db";
import { findActiveOAuthClient, verifyOAuthClientSecret } from "../../src/api/lib/oauth";
import { hashPassword, verifyPassword } from "../../src/api/lib/password";
const run = hasTestDatabase() ? describe : describe.skip;
const sqlDir = path.join(import.meta.dir, "../../src/scripts/sql");
run("Independent Client secret upgrade", () => {
  afterAll(closeDatabase);
  test("preserves confidential verifiers, Client IDs and protocol references without inventing secrets for public clients or reviving revoked credentials", async () => {
    await closeDatabase();
    const previous = await mkdtemp(path.join(tmpdir(), "z0-secrets-upgrade-"));
    const db = createPgSql(process.env.DATABASE_URL!);
    try {
      await mkdir(path.join(previous, "migrations"));
      for (const file of ["schema.sql", "reset.sql"]) await copyFile(path.join(sqlDir, file), path.join(previous, file));
      for (const file of await readdir(path.join(sqlDir, "migrations")))
        if (file.endsWith(".sql") && file < "0049") await copyFile(path.join(sqlDir, "migrations", file), path.join(previous, "migrations", file));
      await resetAndMigrateDatabase(db, previous, false);
      const [app] = await db`INSERT INTO apps(name, slug) VALUES ('Existing', 'existing-secrets') RETURNING id`;
      const value = "existing-high-entropy-secret";
      const digest = await hashPassword(value);
      const [client] = await db`INSERT INTO oauth_clients(app_id, client_id, label, client_type, purpose, client_secret_hash)
        VALUES (${app.id}, 'stable-worker', 'Worker', 'confidential', 'workload', ${digest}) RETURNING id, created_at`;
      const [revoked] = await db`INSERT INTO oauth_clients(app_id, client_id, label, client_type, purpose, client_secret_hash, status, revoked_at)
        VALUES (${app.id}, 'revoked-worker', 'Revoked', 'confidential', 'workload', ${digest}, 'disabled', NOW()) RETURNING id`;
      const [browser] = await db`INSERT INTO oauth_clients(app_id, client_id, label, client_type, purpose, redirect_uris)
        VALUES (${app.id}, 'public-browser', 'Browser', 'public', 'interactive', ARRAY['https://example.com/callback']) RETURNING id`;
      const [resource] = await db`INSERT INTO oauth_resources(app_id, name, audience) VALUES (${app.id}, 'API', 'urn:test:upgrade-secrets') RETURNING id`;
      await db`INSERT INTO client_resource_permissions(client_id, resource_id) VALUES (${client.id}, ${resource.id})`;
      const [grant] = await db`INSERT INTO oauth_grants(app_id, client_id, resource_id, scope) VALUES (${app.id}, ${client.id}, ${resource.id}, '') RETURNING id`;
      const [token] = await db`INSERT INTO oauth_access_tokens(token_hash, app_id, app_credential_id, scope, expires_at, resource_id, grant_id)
        VALUES ('existing-access', ${app.id}, ${client.id}, '', NOW() + INTERVAL '1 hour', ${resource.id}, ${grant.id}) RETURNING id`;
      expect(await applyMigrations(db, path.join(sqlDir, "migrations"), false)).toBe(1);
      const [secret] = await db`SELECT * FROM client_secrets WHERE client_id = ${client.id}`;
      expect(secret.secret_digest).toBe(digest); expect(secret.digest_algorithm).toBe("argon2id");
      expect(await verifyPassword(value, secret.secret_digest)).toBe(true);
      const migratedClient = (await findActiveOAuthClient("stable-worker"))!;
      expect(await verifyOAuthClientSecret(migratedClient, value)).toBe(true);
      expect(migratedClient.authenticatedSecretId).toBe(secret.id);
      expect(await verifyOAuthClientSecret(migratedClient, "incorrect")).toBe(false);
      expect((await db`SELECT last_used_at FROM client_secrets WHERE id = ${secret.id}`)[0].last_used_at).not.toBeNull();
      expect(secret.created_at).toEqual(client.created_at); expect(secret.created_by).toBeNull();
      expect(secret.expires_at).toBeNull(); expect(secret.last_used_at).toBeNull(); expect(secret.revoked_at).toBeNull();
      expect((await db`SELECT client_id FROM oauth_clients WHERE id = ${client.id}`)[0].client_id).toBe("stable-worker");
      expect((await db`SELECT * FROM oauth_clients WHERE id = ${client.id}`)[0].client_secret_hash).toBeUndefined();
      expect(await db`SELECT * FROM client_secrets WHERE client_id = ${browser.id}`).toHaveLength(0);
      expect((await db`SELECT * FROM client_secrets WHERE client_id = ${revoked.id}`)[0].revocation_reason).toBe("ordinary");
      expect((await db`SELECT * FROM oauth_access_tokens WHERE id = ${token.id}`)[0].revoked_at).toBeNull();
      expect(await db`SELECT * FROM client_resource_permissions WHERE client_id = ${client.id}`).toHaveLength(1);
      expect(await applyMigrations(db, path.join(sqlDir, "migrations"), false)).toBe(0);
      await db`DELETE FROM oauth_clients WHERE id = ${client.id}`;
      expect(await db`SELECT id FROM client_secrets WHERE client_id = ${client.id}`).toHaveLength(0);
      expect(await db`SELECT client_id FROM retired_oauth_client_ids WHERE client_id = 'stable-worker'`).toHaveLength(1);
    } finally { await db.close(); await rm(previous, { recursive: true, force: true }); }
  }, 20000);
});
