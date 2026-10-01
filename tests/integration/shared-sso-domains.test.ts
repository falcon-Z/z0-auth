import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import { createServiceGroup, deleteServiceGroup, getServiceGroupForApi, patchServiceGroup, putServiceGroupApps } from "../../src/api/lib/service-groups";
import { createPgSql } from "../../src/api/lib/create-pg-sql";
import { ensureApplicationSubject } from "../../src/api/lib/accounts";
import { getAppUserDetailForApi } from "../../src/api/lib/app-users";
import { sha256Hex } from "../../src/api/lib/crypto";
import { encryptWithDataKey } from "../../src/api/lib/instance-keys";
import { getAppUserMfaStatus, hasAppUserMfa, verifyAppUserMfaProof } from "../../src/api/lib/mfa";
import { listPasskeys, renamePasskey, startPasskeyAuthentication } from "../../src/api/lib/passkeys";
import { linkFederationIdentity } from "../../src/api/lib/federation-linking";
import { generateRecoveryCode, normalizeRecoveryCode } from "../../src/api/lib/totp";
import type { BunRequest } from "bun";
import { applyMigrations, resetAndMigrateDatabase } from "../../src/scripts/migrations";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";

const run = hasTestDatabase() ? describe : describe.skip;
async function app(slug: string) {
  const [row] = await getDb()`INSERT INTO apps (name, slug, client_type, redirect_uris)
    VALUES (${slug}, ${slug}, 'public', '{}') RETURNING id, account_domain_id`;
  return { id: String(row.id), domainId: String(row.account_domain_id) };
}
async function account(appId: string) {
  const [row] = await getDb()`INSERT INTO app_users (app_id, email, name)
    VALUES (${appId}, 'same@example.com', 'Person') RETURNING id, account_id, account_domain_id`;
  return row;
}
async function group(appIds: string[] = [], name = "shared") {
  const result = await createServiceGroup({ name, appIds });
  if (!result.ok) throw new Error(await result.response.text());
  return result.group;
}
async function rejected(query: PromiseLike<unknown>) {
  await expect((async () => await query)()).rejects.toThrow();
}

run("SSO Account Domain placement", () => {
  beforeEach(resetTestDatabase);
  afterAll(closeDatabase);

  test("explicit grouping creates one shared domain; empty apps can leave and move", async () => {
    const a = await app("a"); const b = await app("b");
    expect(a.domainId).not.toBe(b.domainId);
    const g = await group([a.id, b.id]);
    expect(g.ssoEnabled).toBe(true);
    expect(g.boundaryLocked).toBe(false);
    const domains = await getDb()`SELECT account_domain_id FROM apps`;
    expect(domains.every((row: { account_domain_id: string }) => String(row.account_domain_id) === g.accountDomainId)).toBe(true);
    expect((await putServiceGroupApps(g.id, { appIds: [a.id] })).ok).toBe(true);
    const [detached] = await getDb()`SELECT account_domain_id FROM apps WHERE id = ${b.id}`;
    expect(String(detached.account_domain_id)).not.toBe(g.accountDomainId);
    const h = await group([b.id], "other");
    expect(h.accountDomainId).not.toBe(g.accountDomainId);
    expect((await deleteServiceGroup(g.id)).ok).toBe(true);
    const [remaining] = await getDb()`SELECT d.kind FROM apps a JOIN account_domains d ON d.id = a.account_domain_id WHERE a.id = ${a.id}`;
    expect(remaining.kind).toBe("independent");
  });

  test("populated independent join rolls back group and every earlier assignment", async () => {
    const empty = await app("empty"); const populated = await app("populated");
    const identity = await account(populated.id);
    const result = await createServiceGroup({ name: "must-fail", appIds: [empty.id, populated.id] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(409);
      expect(await result.response.text()).toContain("ACCOUNT_DOMAIN_IMMUTABLE");
    }
    expect(await getDb()`SELECT id FROM service_groups`).toHaveLength(0);
    const [state] = await getDb()`SELECT account_domain_id FROM apps WHERE id = ${empty.id}`;
    expect(String(state.account_domain_id)).toBe(empty.domainId);
    const [preserved] = await getDb()`SELECT account_domain_id FROM accounts WHERE id = ${identity.account_id}`;
    expect(String(preserved.account_domain_id)).toBe(populated.domainId);
  });

  test("populated shared domains reject leave/move/delete even without target membership", async () => {
    const a = await app("a"); const b = await app("b"); const c = await app("c");
    const g = await group([a.id, b.id]);
    await account(a.id); // b has no subject or membership but its domain is populated.
    for (const result of [await putServiceGroupApps(g.id, { appIds: [a.id] }), await deleteServiceGroup(g.id)]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(409);
    }
    const h = await group([], "other");
    expect((await putServiceGroupApps(h.id, { appIds: [b.id] })).ok).toBe(false);
    expect((await putServiceGroupApps(g.id, { appIds: [a.id, b.id] })).ok).toBe(true);
    expect((await putServiceGroupApps(g.id, { appIds: [a.id, b.id, c.id] })).ok).toBe(true);
    expect((await patchServiceGroup(g.id, { name: "Renamed", ssoEnabled: false })).ok).toBe(true);
    const detail = await getServiceGroupForApi(g.id);
    expect(detail.ok && detail.group.boundaryLocked).toBe(true);
    expect(detail.ok && detail.group.appCount).toBe(3);
    await rejected(getDb()`DELETE FROM service_group_apps WHERE app_id = ${b.id}`);
    await rejected(getDb()`UPDATE apps SET account_domain_id = ${h.accountDomainId} WHERE id = ${b.id}`);
    await rejected(getDb()`UPDATE service_groups SET account_domain_id = ${h.accountDomainId} WHERE id = ${g.id}`);
  });

  test("identity history keeps placement fixed after final Account purge", async () => {
    const a = await app("a"); const g = await group([a.id]);
    const identity = await account(a.id);
    await getDb()`DELETE FROM accounts WHERE id = ${identity.account_id}`;
    expect(await getDb()`SELECT id FROM accounts`).toHaveLength(0);
    expect((await deleteServiceGroup(g.id)).ok).toBe(false);
    expect((await putServiceGroupApps(g.id, { appIds: [] })).ok).toBe(false);
    await rejected(getDb()`UPDATE account_domains SET identities_created_at = NULL WHERE id = ${g.accountDomainId}`);
  });

  test("competing group assignments cannot leave mismatched group/domain state", async () => {
    const a = await app("a"); const g = await group([], "g"); const h = await group([], "h");
    const outcomes = await Promise.all([
      putServiceGroupApps(g.id, { appIds: [a.id] }), putServiceGroupApps(h.id, { appIds: [a.id] }),
    ]);
    expect(outcomes.filter(r => r.ok)).toHaveLength(1);
    const [row] = await getDb()`SELECT a.account_domain_id, ga.account_domain_id AS group_domain
      FROM apps a JOIN service_group_apps ga ON ga.app_id = a.id WHERE a.id = ${a.id}`;
    expect(row.account_domain_id).toBe(row.group_domain);
  });

  test("Account creation locks the domain before a competing placement change", async () => {
    const a = await app("a"); const g = await group();
    let release!: () => void; let inserted!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { inserted = resolve; });
    const creating = getDb().begin(async tx => {
      await tx`INSERT INTO accounts (account_domain_id, email, name) VALUES (${a.domainId}, 'person@example.com', 'Person')`;
      inserted(); await hold;
    });
    await ready;
    const moving = putServiceGroupApps(g.id, { appIds: [a.id] });
    release(); await creating;
    expect((await moving).ok).toBe(false);
    const [row] = await getDb()`SELECT account_domain_id FROM apps WHERE id = ${a.id}`;
    expect(String(row.account_domain_id)).toBe(a.domainId);
  });

  test("registration racing placement either follows the shared domain or blocks the move", async () => {
    const a = await app("a"); const g = await group();
    const [registered, moved] = await Promise.allSettled([
      account(a.id), putServiceGroupApps(g.id, { appIds: [a.id] }),
    ]);
    const [state] = await getDb()`SELECT a.account_domain_id, c.account_domain_id AS identity_domain
      FROM apps a LEFT JOIN app_account_bindings b ON b.app_id = a.id
      LEFT JOIN accounts c ON c.id = b.account_id WHERE a.id = ${a.id}`;
    if (registered.status === "fulfilled") expect(state.account_domain_id).toBe(state.identity_domain);
    if (moved.status === "fulfilled" && moved.value.ok) expect(String(state.account_domain_id)).toBe(g.accountDomainId);
    expect(registered.status === "fulfilled" || (moved.status === "fulfilled" && moved.value.ok)).toBe(true);
  });

  test("Account authenticators survive enrollment application purge and are removed only with the Account", async () => {
    const a = await app('a'); const b = await app('b');
    await group([a.id, b.id]);
    const identity = await account(a.id);
    const subjectB = await getDb().begin(async tx => {
      const subject = await ensureApplicationSubject(tx, b.id, String(identity.account_id));
      if (!subject) throw new Error('Expected shared Account subject');
      await tx`INSERT INTO application_memberships (subject_id) VALUES (${subject})`;
      return subject;
    });
    const secret = await encryptWithDataKey('JBSWY3DPEHPK3PXP');
    await getDb()`INSERT INTO app_user_totp_factors (app_user_id, secret_ciphertext, confirmed_at)
      VALUES (${identity.id}, ${secret}, NOW())`;
    const recoveryCode = generateRecoveryCode();
    const codeHash = await sha256Hex(normalizeRecoveryCode(recoveryCode)!);
    await getDb()`INSERT INTO app_user_mfa_recovery_codes (app_user_id, code_hash, display_suffix)
      VALUES (${identity.id}, ${codeHash}, 'test')`;
    await getDb()`INSERT INTO app_user_passkey_handles (app_user_id, app_id, user_handle)
      VALUES (${identity.id}, ${a.id}, ${'cd'.repeat(32)})`;
    const credentialId = Buffer.from('surviving-account-credential').toString('base64url');
    await getDb()`INSERT INTO passkey_credential_registry (credential_id, realm) VALUES (${credentialId}, 'app')`;
    const [key] = await getDb()`INSERT INTO app_user_passkeys
      (app_user_id, app_id, credential_id, public_key, algorithm, label)
      VALUES (${identity.id}, ${a.id}, ${credentialId}, 'unused-test-key', -7, 'Shared credential') RETURNING id`;
    const [provider] = await getDb()`INSERT INTO identity_providers (key, type, display_name, issuer)
      VALUES ('shared', 'custom', 'Shared provider', 'https://idp.example.com') RETURNING id`;
    await getDb()`INSERT INTO app_user_identities (app_user_id, app_id, identity_provider_id, provider_subject)
      VALUES (${identity.id}, ${a.id}, ${provider.id}, 'upstream-person')`;
    const beforePurge = await getAppUserDetailForApi(b.id, subjectB);
    expect(beforePurge.ok).toBe(true);
    if (beforePurge.ok) {
      expect(beforePurge.user.mfaEnabled).toBe(true);
      expect(beforePurge.user.passkeyCount).toBe(1);
    }
    // Deleting enrollment A removes its subject and transient authority only.
    await getDb()`DELETE FROM apps WHERE id = ${a.id}`;
    expect(await getDb()`SELECT id FROM app_account_bindings WHERE id = ${identity.id}`).toHaveLength(0);
    expect(await getDb()`SELECT id FROM accounts WHERE id = ${identity.account_id}`).toHaveLength(1);
    const afterPurge = await getAppUserDetailForApi(b.id, subjectB);
    expect(afterPurge.ok).toBe(true);
    if (afterPurge.ok) {
      expect(afterPurge.user.mfaEnabled).toBe(true);
      expect(afterPurge.user.passkeyCount).toBe(1);
    }
    expect(await hasAppUserMfa(subjectB, b.id)).toBe(true);
    expect((await getAppUserMfaStatus(subjectB, b.id)).recoveryCodesRemaining).toBe(1);
    expect((await verifyAppUserMfaProof(subjectB, recoveryCode)).ok).toBe(true);
    expect((await listPasskeys({ realm: 'app', appUserId: subjectB, appId: b.id })).passkeys).toHaveLength(1);
    expect(await renamePasskey({ realm: 'app', appUserId: subjectB, appId: b.id }, String(key.id), 'Still available')).toBe(true);
    const options = await startPasskeyAuthentication(new Request('http://localhost/auth/passkeys') as BunRequest,
      { realm: 'app', appId: b.id, email: 'same@example.com' });
    expect(options.ok).toBe(true);
    if (options.ok) expect(options.options.allowCredentials?.some(value => value.id === credentialId)).toBe(true);
    const linked = await linkFederationIdentity({ appId: b.id, providerId: String(provider.id),
      profile: { subject: 'upstream-person', email: 'same@example.com', emailVerified: true,
        name: 'Person', raw: { sub: 'upstream-person' } } });
    expect(linked.ok && linked.appUserId).toBe(subjectB);
    // Last-use mutations still work with historical source UUIDs.
    await getDb()`UPDATE app_user_passkeys SET signature_counter = 1, last_used_at = NOW() WHERE id = ${key.id}`;
    await getDb()`UPDATE app_user_totp_factors SET last_accepted_step = 1 WHERE account_id = ${identity.account_id}`;
    await rejected(getDb()`UPDATE app_user_passkeys SET app_user_id = ${subjectB} WHERE id = ${key.id}`);
    await rejected(getDb()`INSERT INTO app_user_passkey_handles (app_user_id, app_id, user_handle)
      VALUES (${identity.id}, ${a.id}, 'unknown-subject')`);
    const [retained] = await getDb()`SELECT active FROM passkey_credential_registry WHERE credential_id = ${credentialId}`;
    expect(retained.active).toBe(true);
    await getDb()`DELETE FROM accounts WHERE id = ${identity.account_id}`;
    for (const table of ['app_user_totp_factors', 'app_user_mfa_recovery_codes', 'app_user_passkey_handles',
      'app_user_passkeys', 'app_user_identities']) {
      expect(await getDb().unsafe(`SELECT account_id FROM ${table}`)).toHaveLength(0);
    }
    const [tombstone] = await getDb()`SELECT active, removed_at FROM passkey_credential_registry WHERE credential_id = ${credentialId}`;
    expect(tombstone.active).toBe(false); expect(tombstone.removed_at).toBeTruthy();
  });

  test("migration retires populated pre-Alpha grouping without merging Accounts; empty grouping upgrades", async () => {
    await closeDatabase();
    const sqlDir = path.join(import.meta.dir, "../../src/scripts/sql");
    const previous = await mkdtemp(path.join(tmpdir(), "z0-sso-migration-"));
    const db = createPgSql(process.env.DATABASE_URL!);
    try {
      await mkdir(path.join(previous, "migrations"));
      for (const file of ["schema.sql", "reset.sql"]) await copyFile(path.join(sqlDir, file), path.join(previous, file));
      for (const file of await readdir(path.join(sqlDir, "migrations"))) {
        if (file.endsWith('.sql') && file < '0045') await copyFile(path.join(sqlDir, "migrations", file), path.join(previous, "migrations", file));
      }
      await resetAndMigrateDatabase(db, previous, false);
      const [a] = await db`INSERT INTO apps (name, slug, client_type, redirect_uris) VALUES ('A', 'a', 'public', '{}') RETURNING id`;
      const [b] = await db`INSERT INTO apps (name, slug, client_type, redirect_uris) VALUES ('B', 'b', 'public', '{}') RETURNING id`;
      const [empty] = await db`INSERT INTO apps (name, slug, client_type, redirect_uris) VALUES ('Empty', 'empty', 'public', '{}') RETURNING id`;
      const [outside] = await db`INSERT INTO apps (name, slug, client_type, redirect_uris) VALUES ('Outside', 'outside', 'public', '{}') RETURNING id`;
      const [ua] = await db`INSERT INTO app_users (app_id, email, name) VALUES (${a.id}, 'same@example.com', 'A') RETURNING id, account_id`;
      const [ub] = await db`INSERT INTO app_users (app_id, email, name) VALUES (${b.id}, 'same@example.com', 'B') RETURNING id, account_id`;
      const [uc] = await db`INSERT INTO app_users (app_id, email, name) VALUES (${outside.id}, 'same@example.com', 'Outside') RETURNING id, account_id`;
      const [g] = await db`INSERT INTO service_groups (name, slug, sso_enabled) VALUES ('Legacy', 'legacy', true) RETURNING id`;
      const [h] = await db`INSERT INTO service_groups (name, slug, sso_enabled) VALUES ('Empty', 'empty', true) RETURNING id`;
      await db`INSERT INTO service_group_apps (group_id, app_id) VALUES (${g.id}, ${a.id}), (${g.id}, ${b.id}), (${h.id}, ${empty.id})`;
      const [member] = await db`INSERT INTO service_group_members (group_id, primary_email) VALUES (${g.id}, 'same@example.com') RETURNING id`;
      await db`INSERT INTO service_group_app_users (group_member_id, app_user_id, app_id) VALUES (${member.id}, ${ua.id}, ${a.id}), (${member.id}, ${ub.id}, ${b.id})`;
      // One browser also holds an unrelated independent grant. Old SSO sessions
      // had default assurance metadata, so retirement cannot distinguish them
      // from primary logins in these populated pre-Alpha grouped applications.
      const [browser] = await db`INSERT INTO app_browser_sessions (token_hash, expires_at)
        VALUES ('old-shared-browser', NOW() + INTERVAL '1 hour') RETURNING id`;
      for (const [application, user, label] of [[a, ua, 'a'], [b, ub, 'b'], [outside, uc, 'outside']] as const) {
        const [credential] = await db`INSERT INTO app_credentials (app_id, client_id, label)
          VALUES (${application.id}, ${`client-${label}`}, 'Test') RETURNING id`;
        await db`INSERT INTO app_user_sessions (app_id, app_user_id, browser_session_id, expires_at, primary_authenticated_at)
          VALUES (${application.id}, ${user.id}, ${browser.id}, NOW() + INTERVAL '1 hour', NOW())`;
        await db`INSERT INTO oauth_authorization_codes (app_id, app_user_id, app_credential_id, code_hash, redirect_uri, scope, expires_at)
          VALUES (${application.id}, ${user.id}, ${credential.id}, ${`code-${label}`}, 'http://localhost/callback', 'openid', NOW() + INTERVAL '1 hour')`;
        await db`INSERT INTO oauth_access_tokens (app_id, app_user_id, app_credential_id, token_hash, expires_at)
          VALUES (${application.id}, ${user.id}, ${credential.id}, ${`access-${label}`}, NOW() + INTERVAL '1 hour')`;
        await db`INSERT INTO oauth_refresh_tokens (app_id, app_user_id, app_credential_id, token_hash, expires_at)
          VALUES (${application.id}, ${user.id}, ${credential.id}, ${`refresh-${label}`}, NOW() + INTERVAL '1 hour')`;
        await db`INSERT INTO app_user_mfa_challenges (app_id, app_user_id, token_hash, primary_method, ip_hash, user_agent_hash, expires_at)
          VALUES (${application.id}, ${user.id}, ${`mfa-${label}`}, ${label === 'outside' ? 'password' : 'service_group'}, 'ip', 'ua', NOW() + INTERVAL '1 hour')`;
        await db`INSERT INTO oauth_consent_challenges (app_id, app_user_id, app_credential_id, nonce_hash, redirect_uri, expires_at)
          VALUES (${application.id}, ${user.id}, ${credential.id}, ${`consent-${label}`}, 'http://localhost/callback', NOW() + INTERVAL '1 hour')`;
        if (label === 'b') {
          await db`INSERT INTO oauth_access_tokens (app_id, app_credential_id, token_hash, expires_at)
            VALUES (${application.id}, ${credential.id}, 'workload-b', NOW() + INTERVAL '1 hour')`;
        }
      }
      expect(await applyMigrations(db, path.join(sqlDir, "migrations"), false)).toBe(1);
      expect(await db`SELECT id FROM accounts`).toHaveLength(3);
      for (const table of ['app_user_sessions', 'oauth_access_tokens', 'oauth_refresh_tokens']) {
        const grants = await db.unsafe(`SELECT app_id, revoked_at FROM ${table} WHERE app_user_id IS NOT NULL`);
        expect(grants).toHaveLength(3);
        for (const grant of grants) {
          if (String(grant.app_id) === String(outside.id)) expect(grant.revoked_at).toBeNull();
          else expect(grant.revoked_at).toBeTruthy();
        }
      }
      for (const [table, column] of [['oauth_authorization_codes', 'used_at'],
        ['app_user_mfa_challenges', 'consumed_at'], ['oauth_consent_challenges', 'consumed_at']] as const) {
        const challenges = await db.unsafe(`SELECT app_id, ${column} AS consumed FROM ${table}`);
        expect(challenges).toHaveLength(3);
        for (const challenge of challenges) {
          if (String(challenge.app_id) === String(outside.id)) expect(challenge.consumed).toBeNull();
          else expect(challenge.consumed).toBeTruthy();
        }
      }
      const [unrelatedBrowser] = await db`SELECT revoked_at FROM app_browser_sessions WHERE id = ${browser.id}`;
      expect(unrelatedBrowser.revoked_at).toBeNull();
      const [workload] = await db`SELECT revoked_at FROM oauth_access_tokens WHERE token_hash = 'workload-b'`;
      expect(workload.revoked_at).toBeNull();
      expect(await db`SELECT app_id FROM service_group_apps WHERE group_id = ${g.id}`).toHaveLength(0);
      const identities = await db`SELECT account_id FROM app_users ORDER BY name`;
      expect(identities.map((r: { account_id: string }) => r.account_id)).toEqual([ua.account_id, ub.account_id, uc.account_id]);
      const populatedDomains = await db`SELECT account_domain_id FROM apps WHERE id IN (${a.id}, ${b.id})`;
      expect(new Set(populatedDomains.map((r: { account_domain_id: string }) => r.account_domain_id)).size).toBe(2);
      expect(await db`SELECT b.id FROM app_account_bindings b JOIN accounts c ON c.id = b.account_id
        WHERE b.account_domain_id <> c.account_domain_id`).toHaveLength(0);
      const [upgraded] = await db`SELECT a.account_domain_id, g.account_domain_id AS group_domain
        FROM apps a JOIN service_group_apps ga ON ga.app_id = a.id JOIN service_groups g ON g.id = ga.group_id WHERE a.id = ${empty.id}`;
      expect(upgraded.account_domain_id).toBe(upgraded.group_domain);
      const [retired] = await db`SELECT to_regclass('service_group_members') AS members, to_regclass('service_group_app_users') AS links`;
      expect(retired.members).toBeNull(); expect(retired.links).toBeNull();
      expect(await applyMigrations(db, path.join(sqlDir, "migrations"), false)).toBe(0);
    } finally { await db.close(); await rm(previous, { recursive: true, force: true }); }
  });
});
