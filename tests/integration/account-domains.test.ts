import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { BunRequest } from "bun";
import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { findAccountForApplication } from "../../src/api/lib/accounts";
import { runAppLogin } from "../../src/api/lib/app-auth";
import { APP_SESSION_COOKIE, resolveAppSessionForApp } from "../../src/api/lib/app-session";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import { hashPassword } from "../../src/api/lib/password";
import { createPgSql } from "../../src/api/lib/create-pg-sql";
import { applyMigrations, resetAndMigrateDatabase } from "../../src/scripts/migrations";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { makeStrongPassword } from "../helpers/password";
import { buildRequest } from "../helpers/http";

const run = hasTestDatabase() ? describe : describe.skip;
const sqlDir = path.join(import.meta.dir, "../../src/scripts/sql");

async function application(slug: string, domainId?: string) {
  const [row] = await getDb()`
    INSERT INTO apps (name, slug, account_domain_id)
    VALUES (${slug}, ${slug}, ${domainId ?? null}) RETURNING id, account_domain_id
  `;
  return { id: String(row.id), domainId: String(row.account_domain_id) };
}

async function appUser(appId: string, email = "same@example.com", passwordHash: string | null = null) {
  const [row] = await getDb()`
    INSERT INTO app_users (app_id, email, name, password_hash)
    VALUES (${appId}, ${email}, 'Person', ${passwordHash})
    RETURNING id, account_id, account_domain_id
  `;
  return { id: String(row.id), accountId: String(row.account_id), domainId: String(row.account_domain_id) };
}

// Bun SQL is lazy: materialize a native Promise before passing it to expect.
async function rejected(query: PromiseLike<unknown>) {
  await expect((async () => await query)()).rejects.toThrow();
}

run("canonical Account Domains and Accounts", () => {
  beforeEach(resetTestDatabase);
  afterAll(closeDatabase);

  test("legacy migration preserves independent accounts, IDs, security state, and operator separation", async () => {
    await closeDatabase();
    const previousSql = await mkdtemp(path.join(tmpdir(), "z0-account-migration-"));
    const db = createPgSql(process.env.DATABASE_URL!);
    try {
      await mkdir(path.join(previousSql, "migrations"));
      for (const file of ["schema.sql", "reset.sql"]) {
        await copyFile(path.join(sqlDir, file), path.join(previousSql, file));
      }
      for (const file of await readdir(path.join(sqlDir, "migrations"))) {
        if (file.endsWith(".sql") && file < "0043") {
          await copyFile(path.join(sqlDir, "migrations", file), path.join(previousSql, "migrations", file));
        }
      }
      await resetAndMigrateDatabase(db, previousSql, false);
      const [operator] = await db`INSERT INTO users (email, name) VALUES ('same@example.com', 'Operator') RETURNING id`;
      const [a] = await db`INSERT INTO apps (name, slug, client_type, redirect_uris) VALUES ('A', 'a', 'public', '{}') RETURNING id`;
      const [b] = await db`INSERT INTO apps (name, slug, client_type, redirect_uris) VALUES ('B', 'b', 'public', '{}') RETURNING id`;
      const [ua] = await db`INSERT INTO app_users (app_id, email, name, password_hash, metadata, locked_until)
        VALUES (${a.id}, 'same@example.com', 'Alice', 'hash-a', '{"team":"a"}', NOW() + INTERVAL '1 hour') RETURNING id`;
      const [ub] = await db`INSERT INTO app_users (app_id, email, name, password_hash)
        VALUES (${b.id}, 'same@example.com', 'Bob', 'hash-b') RETURNING id`;
      await db`INSERT INTO app_password_reset_tokens (app_user_id, app_id, token_hash, expires_at)
        VALUES (${ua.id}, ${a.id}, 'legacy-reset', NOW() + INTERVAL '1 hour')`;

      expect(await applyMigrations(db, path.join(sqlDir, "migrations"), false)).toBe(7);
      const rows = await db`SELECT id, account_id, account_domain_id, password_hash, metadata, locked_until FROM app_users ORDER BY name`;
      expect(rows).toHaveLength(2);
      expect(String(rows[0].id)).toBe(String(ua.id));
      expect(String(rows[1].id)).toBe(String(ub.id));
      expect(rows[0].account_id).not.toBe(rows[1].account_id);
      expect(rows[0].account_domain_id).not.toBe(rows[1].account_domain_id);
      expect(rows.map((r: { password_hash: string }) => r.password_hash)).toEqual(["hash-a", "hash-b"]);
      expect(rows[0].metadata).toEqual({ team: "a" });
      expect(rows[0].locked_until).toBeTruthy();
      expect(rows[0].account_id).not.toBe(operator.id);
      const [reset] = await db`SELECT account_id, account_domain_id FROM app_password_reset_tokens WHERE token_hash = 'legacy-reset'`;
      expect(reset.account_id).toBe(rows[0].account_id);
      expect(reset.account_domain_id).toBe(rows[0].account_domain_id);
      expect(await applyMigrations(db, path.join(sqlDir, "migrations"), false)).toBe(0);
    } finally {
      await db.close();
      await rm(previousSql, { recursive: true, force: true });
    }
  });

  test("independent apps allocate domains; shared domains require explicit assignment", async () => {
    const a = await application("a");
    const b = await application("b");
    expect(a.domainId).not.toBe(b.domainId);
    await expect(application("illegal", a.domainId)).rejects.toThrow();
    const [shared] = await getDb()`INSERT INTO account_domains (kind) VALUES ('shared') RETURNING id`;
    const c = await application("c", String(shared.id));
    const d = await application("d", String(shared.id));
    expect(c.domainId).toBe(d.domainId);
  });

  test("domain-scoped email and username uniqueness survives concurrent writes", async () => {
    const a = await application("a");
    const b = await application("b");
    const attempts = await Promise.allSettled([appUser(a.id), appUser(a.id)]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((r) => r.status === "rejected")).toHaveLength(1);
    const other = await appUser(b.id);
    const [first] = await getDb()`SELECT id FROM accounts WHERE account_domain_id = ${a.domainId}`;
    await getDb()`UPDATE accounts SET username = 'Person' WHERE id = ${first.id}`;
    await getDb()`UPDATE accounts SET username = 'PERSON' WHERE id = ${other.accountId}`;
    const another = await appUser(a.id, "another@example.com");
    await rejected(getDb()`UPDATE accounts SET username = 'person' WHERE id = ${another.accountId}`);
    expect(await getDb()`SELECT id FROM accounts`).toHaveLength(3);
  });

  test("adapter updates canonical credentials and profile without changing app-facing IDs", async () => {
    const a = await application("a");
    const user = await appUser(a.id);
    await getDb()`UPDATE app_users SET email = 'renamed@example.com', name = 'Renamed', password_hash = 'new-hash',
      disabled_at = NOW(), metadata = '{"team":"a"}' WHERE id = ${user.id}`;
    const account = await findAccountForApplication(a.id, "RENAMED@example.com");
    expect(account?.accountId).toBe(user.accountId);
    expect(account?.appUserId).toBe(user.id);
    expect(account?.passwordHash).toBe("new-hash");
    expect(account?.disabledAt).toBeTruthy();
    const [binding] = await getDb()`SELECT metadata FROM app_account_bindings WHERE id = ${user.id}`;
    expect(binding.metadata).toEqual({ team: "a" });
    expect(await findAccountForApplication(a.id, "same@example.com")).toBeNull();
  });

  test("accounts resolve before app bindings and authentication never creates a binding", async () => {
    const [shared] = await getDb()`INSERT INTO account_domains (kind) VALUES ('shared') RETURNING id`;
    const a = await application("a", String(shared.id));
    const b = await application("b", String(shared.id));
    const password = makeStrongPassword();
    const user = await appUser(a.id, "same@example.com", await hashPassword(password));
    const account = await findAccountForApplication(b.id, "same@example.com");
    expect(account?.accountId).toBe(user.accountId);
    expect(account?.appUserId).toBeNull();
    const result = await runAppLogin(buildRequest("POST", "/auth/login") as BunRequest, b.id, "same@example.com", password);
    expect(result.ok).toBe(false);
    expect(await getDb()`SELECT id FROM app_account_bindings WHERE app_id = ${b.id}`).toHaveLength(0);
    await expect(appUser(b.id)).rejects.toThrow();
  });

  test("passwords, sessions, reset credentials, and authenticator ownership cannot cross domains", async () => {
    const a = await application("a");
    const b = await application("b");
    const passwordA = makeStrongPassword();
    const passwordB = makeStrongPassword();
    const ua = await appUser(a.id, "same@example.com", await hashPassword(passwordA));
    const ub = await appUser(b.id, "same@example.com", await hashPassword(passwordB));
    const req = buildRequest("POST", "/auth/login") as BunRequest;
    const denied = await runAppLogin(req, b.id, "same@example.com", passwordA);
    expect(denied.ok).toBe(false);
    const login = await runAppLogin(req, a.id, "same@example.com", passwordA);
    expect(login.ok).toBe(true);
    if (!login.ok || login.mfaRequired) throw new Error("Expected password session");
    const token = login.setCookie.split(";")[0]!;
    expect(token.startsWith(APP_SESSION_COOKIE + "=")).toBe(true);
    const sessionReq = new Request("http://localhost", { headers: { cookie: token } });
    expect((await resolveAppSessionForApp(sessionReq, a.id))?.appUserId).toBe(ua.id);
    expect(await resolveAppSessionForApp(sessionReq, b.id)).toBeNull();
    const [session] = await getDb()`SELECT account_id, account_domain_id FROM app_user_sessions WHERE app_user_id = ${ua.id}`;
    expect(String(session.account_id)).toBe(ua.accountId);
    expect(String(session.account_domain_id)).toBe(a.domainId);
    await rejected(getDb()`INSERT INTO app_password_reset_tokens (app_user_id, app_id, token_hash, expires_at)
      VALUES (${ua.id}, ${b.id}, 'bad-context', NOW() + INTERVAL '1 hour')`);
    await rejected(getDb()`INSERT INTO app_password_reset_tokens (app_user_id, app_id, account_id, account_domain_id, token_hash, expires_at)
      VALUES (${ua.id}, ${a.id}, ${ub.accountId}, ${b.domainId}, 'bad-owner', NOW() + INTERVAL '1 hour')`);
    await rejected(getDb()`INSERT INTO app_user_totp_factors (app_user_id, account_id, account_domain_id, secret_ciphertext)
      VALUES (${ua.id}, ${ub.accountId}, ${b.domainId}, 'ciphertext')`);
  });

  test("populated domains and account/application bindings cannot move", async () => {
    const a = await application("a");
    const b = await application("b");
    const ua = await appUser(a.id);
    const another = await appUser(a.id, "other@example.com");
    await rejected(getDb()`UPDATE apps SET account_domain_id = ${b.domainId} WHERE id = ${a.id}`);
    await rejected(getDb()`UPDATE app_users SET app_id = ${b.id} WHERE id = ${ua.id}`);
    await rejected(getDb()`UPDATE app_account_bindings SET account_domain_id = ${b.domainId} WHERE id = ${ua.id}`);
    await rejected(getDb()`UPDATE app_account_bindings SET account_id = ${another.accountId} WHERE id = ${ua.id}`);
    await rejected(getDb()`UPDATE accounts SET account_domain_id = ${b.domainId} WHERE id = ${ua.accountId}`);
  });

  test("issuer/subject uniqueness belongs to the domain and survives provider configuration edits", async () => {
    const [shared] = await getDb()`INSERT INTO account_domains (kind) VALUES ('shared') RETURNING id`;
    const a = await application("a", String(shared.id));
    const b = await application("b", String(shared.id));
    const independent = await application("independent");
    const ua = await appUser(a.id);
    const ub = await appUser(b.id, "other@example.com");
    const uc = await appUser(independent.id);
    const [p] = await getDb()`INSERT INTO identity_providers (key, type, display_name, issuer)
      VALUES ('example', 'custom', 'Example', 'https://idp.example.com') RETURNING id`;
    await getDb()`INSERT INTO app_user_identities (app_user_id, app_id, identity_provider_id, provider_subject)
      VALUES (${ua.id}, ${a.id}, ${p.id}, 'subject')`;
    await rejected(getDb()`INSERT INTO app_user_identities (app_user_id, app_id, identity_provider_id, provider_subject)
      VALUES (${ub.id}, ${b.id}, ${p.id}, 'subject')`);
    await getDb()`INSERT INTO app_user_identities (app_user_id, app_id, identity_provider_id, provider_subject)
      VALUES (${uc.id}, ${independent.id}, ${p.id}, 'subject')`;
    await getDb()`UPDATE identity_providers SET issuer = 'https://other.example.com' WHERE id = ${p.id}`;
    const [link] = await getDb()`SELECT issuer FROM app_user_identities WHERE app_user_id = ${ua.id}`;
    expect(link.issuer).toBe("https://idp.example.com");
    await rejected(getDb()`UPDATE app_user_identities SET issuer = 'https://other.example.com' WHERE app_user_id = ${ua.id}`);
  });
});
