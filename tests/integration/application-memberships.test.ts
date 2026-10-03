import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { BunRequest } from "bun";
import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ensureApplicationSubject, findAccountForApplication } from "../../src/api/lib/accounts";
import { finalizeAppPasswordSignIn } from "../../src/api/lib/account-lifecycle";
import { runAppLogin } from "../../src/api/lib/app-auth";
import { resolveAppSessionForApp } from "../../src/api/lib/app-session";
import { changeApplicationMembership } from "../../src/api/lib/application-memberships";
import { addApplicationMembershipForApi, getAppUserDetailForApi, patchAppUserForApi, removeApplicationMembershipForApi, transitionAppUserForApi } from "../../src/api/lib/app-users";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import { createPgSql } from "../../src/api/lib/create-pg-sql";
import { issueAuthorizationCode } from "../../src/api/lib/oauth";
import { hashPassword } from "../../src/api/lib/password";
import { createSession, SESSION_COOKIE } from "../../src/api/lib/session";
import { applyMigrations, resetAndMigrateDatabase } from "../../src/scripts/migrations";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;
const redirect = "http://localhost:3000/callback";
const sqlDir = path.join(import.meta.dir, "../../src/scripts/sql");

async function fixture() {
  const db = getDb();
  const [actor] = await db`INSERT INTO users (email, name) VALUES ('operator@example.com', 'Operator') RETURNING id`;
  const [domain] = await db`INSERT INTO account_domains (kind) VALUES ('shared') RETURNING id`;
  const apps = [];
  for (const slug of ["a", "b"]) {
    const [app] = await db`INSERT INTO apps (name, slug, account_domain_id)
      VALUES (${slug}, ${slug}, ${domain.id}) RETURNING id`;
    apps.push(String(app.id));
  }
  const password = makeStrongPassword();
  const [user] = await db`INSERT INTO app_users (app_id, email, name, password_hash, metadata, email_verified_at)
    VALUES (${apps[0]!}, 'person@example.com', 'Person', ${await hashPassword(password)}, '{"team":"a"}', NOW())
    RETURNING id, account_id`;
  return { actorId: String(actor.id), appA: apps[0]!, appB: apps[1]!, subjectA: String(user.id), accountId: String(user.account_id), password };
}

async function login(appId: string, password: string) {
  const result = await runAppLogin(buildRequest("POST", "/auth/login") as BunRequest, appId, "person@example.com", password);
  if (!result.ok || result.mfaRequired) throw new Error("Expected password login");
  return result.setCookie.split(";")[0]!;
}

async function oidcTokens(appId: string, subjectId: string) {
  const clientId = `client-${crypto.randomUUID()}`;
  const [credential] = await getDb()`INSERT INTO oauth_clients (app_id, client_id, label, client_type, redirect_uris, refresh_enabled)
    VALUES (${appId}, ${clientId}, 'Test', 'public', ARRAY[${redirect}], TRUE) RETURNING id`;
  const verifier = "a".repeat(43);
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  const code = await issueAuthorizationCode({ appId, appUserId: subjectId, appCredentialId: String(credential.id),
    redirectUri: redirect, scope: "openid profile email", codeChallenge: challenge, codeChallengeMethod: "S256", nonce: null });
  const response = await dispatchWeb(new Request("http://localhost/oauth/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: redirect, code_verifier: verifier }),
  }));
  expect(response.status).toBe(200);
  return await response.json() as { id_token: string; access_token: string; refresh_token: string };
}

run("Application Subjects and Memberships", () => {
  beforeEach(resetTestDatabase);
  afterAll(closeDatabase);

  test("0043 upgrade preserves existing subjects, account lifecycle, metadata and security records", async () => {
    await closeDatabase();
    const prior = await mkdtemp(path.join(tmpdir(), "z0-membership-migration-"));
    const db = createPgSql(process.env.DATABASE_URL!);
    try {
      await mkdir(path.join(prior, "migrations"));
      for (const file of ["schema.sql", "reset.sql"]) await copyFile(path.join(sqlDir, file), path.join(prior, file));
      for (const file of await readdir(path.join(sqlDir, "migrations"))) {
        if (file.endsWith(".sql") && file < "0044") await copyFile(path.join(sqlDir, "migrations", file), path.join(prior, "migrations", file));
      }
      await resetAndMigrateDatabase(db, prior, false);
      const [app] = await db`INSERT INTO apps (name, slug, client_type, redirect_uris) VALUES ('A', 'a', 'public', '{}') RETURNING id`;
      const [user] = await db`INSERT INTO app_users (app_id, email, name, metadata, status, disabled_at)
        VALUES (${app.id}, 'person@example.com', 'Person', '{"team":"a"}', 'disabled', NOW()) RETURNING id, account_id`;
      await db`INSERT INTO app_password_reset_tokens (app_id, app_user_id, token_hash, expires_at)
        VALUES (${app.id}, ${user.id}, 'legacy-reset', NOW() + INTERVAL '1 hour')`;
      expect(await applyMigrations(db, path.join(sqlDir, "migrations"), false)).toBe(3);
      const [upgraded] = await db`SELECT id, account_id, account_status, membership_status, metadata FROM app_users`;
      expect(upgraded.id).toBe(user.id);
      expect(upgraded.account_id).toBe(user.account_id);
      expect(upgraded.account_status).toBe("disabled");
      expect(upgraded.membership_status).toBe("active");
      expect(upgraded.metadata).toEqual({ team: "a" });
      expect(await db`SELECT id FROM app_password_reset_tokens WHERE token_hash = 'legacy-reset'`).toHaveLength(1);
      expect(await applyMigrations(db, path.join(sqlDir, "migrations"), false)).toBe(0);
    } finally {
      await db.close();
      await rm(prior, { recursive: true, force: true });
    }
  });

  test("concurrent subject reservation is stable and creates no membership or metadata", async () => {
    const f = await fixture();
    const subjects = await Promise.all(Array.from({ length: 4 }, () => getDb().begin((tx) => ensureApplicationSubject(tx, f.appB, f.accountId))));
    expect(new Set(subjects).size).toBe(1);
    expect(subjects[0]).not.toBe(f.subjectA);
    expect(subjects[0]).not.toBe(f.accountId);
    const account = await findAccountForApplication(f.appB, "person@example.com");
    expect(account?.accountId).toBe(f.accountId);
    expect(account?.membershipStatus).toBe("removed");
    expect(await getDb()`SELECT subject_id FROM application_memberships WHERE subject_id = ${subjects[0]}`).toHaveLength(0);
    expect((await runAppLogin(buildRequest("POST", "/auth/login") as BunRequest, f.appB, "person@example.com", f.password)).ok).toBe(false);
    const detail = await getAppUserDetailForApi(f.appB, subjects[0]!);
    expect(detail.ok && detail.user.metadata).toBeNull();
    expect(detail.ok && detail.user.accountStatus).toBe("active");
    const memberships = await Promise.all(Array.from({ length: 4 }, () => addApplicationMembershipForApi(f.appB, f.accountId, f.actorId)));
    for (const membership of memberships) {
      expect(membership.ok && membership.user.userId).toBe(subjects[0]!);
    }
    expect(await getDb()`SELECT subject_id FROM application_memberships WHERE subject_id = ${subjects[0]}`).toHaveLength(1);
  });

  test("removal and rejoin preserve OIDC sub, account credentials, metadata and other application access", async () => {
    const f = await fixture();
    const memberB = await addApplicationMembershipForApi(f.appB, f.accountId, f.actorId);
    if (!memberB.ok) throw new Error("Expected membership");
    const subjectB = memberB.user.userId;
    const cookieA = await login(f.appA, f.password);
    const cookieB = await login(f.appB, f.password);
    const tokens = await oidcTokens(f.appA, f.subjectA);
    const claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1]!, "base64url").toString());
    expect(claims.sub).toBe(f.subjectA);
    const removed = await removeApplicationMembershipForApi(f.appA, f.subjectA, f.actorId);
    expect(removed.ok && removed.user.membershipStatus).toBe("removed");
    expect(removed.ok && removed.user.accountStatus).toBe("active");
    expect(await getDb()`SELECT id FROM accounts WHERE id = ${f.accountId} AND password_hash IS NOT NULL`).toHaveLength(1);
    expect(await resolveAppSessionForApp(new Request("http://localhost", { headers: { cookie: cookieA } }), f.appA)).toBeNull();
    expect((await resolveAppSessionForApp(new Request("http://localhost", { headers: { cookie: cookieB } }), f.appB))?.appUserId).toBe(subjectB);
    const rejoined = await addApplicationMembershipForApi(f.appA, f.accountId, f.actorId);
    expect(rejoined.ok && rejoined.user.userId).toBe(f.subjectA);
    expect(rejoined.ok && rejoined.user.metadata).toEqual({ team: "a" });
    expect(await resolveAppSessionForApp(new Request("http://localhost", { headers: { cookie: cookieA } }), f.appA)).toBeNull();
    const rejectedToken = await dispatchWeb(new Request("http://localhost/oauth/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } }));
    expect(rejectedToken.status).toBe(401);
    await getDb()`UPDATE accounts SET email = 'changed@example.com', name = 'Changed', username = 'Changed' WHERE id = ${f.accountId}`;
    const newTokens = await oidcTokens(f.appA, f.subjectA);
    const newClaims = JSON.parse(Buffer.from(newTokens.id_token.split(".")[1]!, "base64url").toString());
    expect(newClaims.sub).toBe(claims.sub);
    const userinfo = await dispatchWeb(new Request("http://localhost/oauth/userinfo", { headers: { authorization: `Bearer ${newTokens.access_token}` } }));
    expect(userinfo.status).toBe(200);
    expect((await userinfo.json() as { sub: string }).sub).toBe(f.subjectA);
  });

  test("Account suspension contains all memberships without resurrecting authority on enable", async () => {
    const f = await fixture();
    const b = await addApplicationMembershipForApi(f.appB, f.accountId, f.actorId);
    if (!b.ok) throw new Error("Expected membership");
    const cookieA = await login(f.appA, f.password);
    const cookieB = await login(f.appB, f.password);
    await transitionAppUserForApi(f.appA, f.subjectA, f.actorId, "disable");
    const detailB = await getAppUserDetailForApi(f.appB, b.user.userId);
    expect(detailB.ok && detailB.user.membershipStatus).toBe("active");
    expect(detailB.ok && detailB.user.accountStatus).toBe("disabled");
    await transitionAppUserForApi(f.appA, f.subjectA, f.actorId, "enable");
    for (const [appId, cookie] of [[f.appA, cookieA], [f.appB, cookieB]]) {
      expect(await resolveAppSessionForApp(new Request("http://localhost", { headers: { cookie } }), appId!)).toBeNull();
    }
    expect((await runAppLogin(buildRequest("POST", "/auth/login") as BunRequest, f.appB, "person@example.com", f.password)).ok).toBe(true);
  });

  test("membership suspension is local; shared profile updates preserve distinct subjects and opaque metadata", async () => {
    const f = await fixture();
    const memberB = await addApplicationMembershipForApi(f.appB, f.accountId, f.actorId);
    if (!memberB.ok) throw new Error("Expected membership");
    await patchAppUserForApi(f.appB, memberB.user.userId, f.actorId, { metadata: { role: "admin", team: "b" } });
    const disabled = await patchAppUserForApi(f.appA, f.subjectA, f.actorId, { membershipStatus: "disabled" });
    expect(disabled.ok && disabled.user.accountStatus).toBe("active");
    expect(disabled.ok && disabled.user.membershipStatus).toBe("disabled");
    expect((await runAppLogin(buildRequest("POST", "/auth/login") as BunRequest, f.appA, "person@example.com", f.password)).ok).toBe(false);
    expect((await runAppLogin(buildRequest("POST", "/auth/login") as BunRequest, f.appB, "person@example.com", f.password)).ok).toBe(true);
    await getDb()`UPDATE accounts SET email = 'renamed@example.com', username = 'Renamed', name = 'Renamed' WHERE id = ${f.accountId}`;
    const a = await getAppUserDetailForApi(f.appA, f.subjectA);
    const b = await getAppUserDetailForApi(f.appB, memberB.user.userId);
    expect(a.ok && a.user.userId).toBe(f.subjectA);
    expect(a.ok && a.user.metadata).toEqual({ team: "a" });
    expect(b.ok && b.user.userId).toBe(memberB.user.userId);
    expect(b.ok && b.user.membershipStatus).toBe("active");
    expect(b.ok && b.user.metadata).toEqual({ role: "admin", team: "b" });
    const [account] = await getDb()`SELECT to_jsonb(c) AS data FROM accounts c WHERE id = ${f.accountId}`;
    expect(account.data).not.toHaveProperty("metadata");
    const invalid = await patchAppUserForApi(f.appB, memberB.user.userId, f.actorId, { metadata: { sub: "attacker" } });
    expect(!invalid.ok && invalid.response.status).toBe(400);
  });

  test("membership cannot attach across domains, change subjects, or reactivate a deleted account", async () => {
    const f = await fixture();
    const [independent] = await getDb()`INSERT INTO apps (name, slug) VALUES ('C', 'c') RETURNING id`;
    const denied = await addApplicationMembershipForApi(String(independent.id), f.accountId, f.actorId);
    expect(!denied.ok && denied.response.status).toBe(404);
    const cross = await removeApplicationMembershipForApi(f.appB, f.subjectA, f.actorId);
    expect(!cross.ok && cross.response.status).toBe(404);
    const b = await addApplicationMembershipForApi(f.appB, f.accountId, f.actorId);
    if (!b.ok) throw new Error("Expected membership");
    await expect((async () => await getDb()`UPDATE application_memberships SET subject_id = ${b.user.userId} WHERE subject_id = ${f.subjectA}`)()).rejects.toThrow();
    await transitionAppUserForApi(f.appA, f.subjectA, f.actorId, "delete");
    const deleted = await addApplicationMembershipForApi(f.appA, f.accountId, f.actorId);
    expect(!deleted.ok && deleted.response.status).toBe(409);
    expect((await findAccountForApplication(f.appA, "person@example.com"))?.deletedAt).toBeTruthy();
  });

  test("removing membership preserves authenticators and external identity links", async () => {
    const f = await fixture();
    await getDb()`INSERT INTO app_user_totp_factors (app_user_id, secret_ciphertext) VALUES (${f.subjectA}, 'encrypted')`;
    const [provider] = await getDb()`INSERT INTO identity_providers (key, type, display_name, issuer)
      VALUES ('example', 'custom', 'Example', 'https://idp.example.com') RETURNING id`;
    await getDb()`INSERT INTO app_user_identities (app_user_id, app_id, identity_provider_id, provider_subject)
      VALUES (${f.subjectA}, ${f.appA}, ${provider.id}, 'external-subject')`;
    await removeApplicationMembershipForApi(f.appA, f.subjectA, f.actorId);
    expect(await getDb()`SELECT id FROM app_user_totp_factors WHERE app_user_id = ${f.subjectA}`).toHaveLength(1);
    expect(await getDb()`SELECT id FROM app_user_identities WHERE app_user_id = ${f.subjectA}`).toHaveLength(1);
    const rejoined = await addApplicationMembershipForApi(f.appA, f.accountId, f.actorId);
    expect(rejoined.ok && rejoined.user.userId).toBe(f.subjectA);
  });

  test("concurrent removal and issuance cannot leave renewable application authority", async () => {
    const f = await fixture();
    const [credential] = await getDb()`INSERT INTO oauth_clients (app_id, client_id, label, client_type, redirect_uris, refresh_enabled) VALUES (${f.appA}, 'race-client', 'Test', 'public', ARRAY[${redirect}], TRUE) RETURNING id`;
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    let signal!: () => void;
    const removed = new Promise<void>((resolve) => { signal = resolve; });
    const mutation = getDb().begin(async (tx) => {
      expect(await changeApplicationMembership(tx, f.appA, f.subjectA, "removed", f.actorId)).toBe("updated");
      signal();
      await hold;
    });
    await removed;
    const finalization = finalizeAppPasswordSignIn(f.subjectA, f.appA, async () => {
      throw new Error("Removed membership must not create login authority");
    });
    const issuance = issueAuthorizationCode({ appId: f.appA, appUserId: f.subjectA, appCredentialId: String(credential.id),
      redirectUri: redirect, scope: "openid", codeChallenge: null, codeChallengeMethod: null, nonce: null });
    // Release the transaction once PostgreSQL has observed the competing lock.
    for (let i = 0; i < 100; i++) {
      const [waiting] = await getDb()`SELECT COUNT(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%INSERT INTO oauth_authorization_codes%'`;
      if (Number(waiting.count) > 0) break;
      if (i === 99) { release(); throw new Error("Issuance did not wait for membership lock"); }
      await Bun.sleep(10);
    }
    release();
    await mutation;
    expect(await finalization).toBeNull();
    await expect(issuance).rejects.toThrow("Active application membership required");
    expect(await getDb()`SELECT id FROM oauth_authorization_codes WHERE app_user_id = ${f.subjectA}`).toHaveLength(0);
  });

  test("admin routes enforce CSRF and operator authority and return distinct account and membership state", async () => {
    const f = await fixture();
    const csrf = await fetchCsrfToken(dispatchApi);
    const setupPassword = makeStrongPassword();
    const setup = await dispatchApi(buildRequest("POST", "/api/setup", { csrfToken: csrf,
      body: { name: "Owner", email: "owner@example.com", password: setupPassword, passwordConfirm: setupPassword, organizationName: "Example" } }));
    expect(setup.status).toBe(201);
    const [owner] = await getDb()`SELECT id FROM users WHERE email = 'owner@example.com'`;
    const ownerSession = await createSession(String(owner.id), buildRequest("GET", "/"));
    const ordinarySession = await createSession(f.actorId, buildRequest("GET", "/"));
    const route = `/api/v1/apps/${f.appA}/users/${f.subjectA}/membership`;
    const noCsrf = await dispatchApi(buildRequest("DELETE", route, { cookies: { [SESSION_COOKIE]: ownerSession.token } }));
    expect(noCsrf.status).toBe(403);
    const anonymous = await dispatchApi(buildRequest("DELETE", route, { csrfToken: csrf }));
    expect(anonymous.status).toBe(401);
    const ordinary = await dispatchApi(buildRequest("DELETE", route, { csrfToken: csrf, cookies: { [SESSION_COOKIE]: ordinarySession.token } }));
    expect(ordinary.status).toBe(403);
    const response = await dispatchApi(buildRequest("DELETE", route, { csrfToken: csrf, cookies: { [SESSION_COOKIE]: ownerSession.token } }));
    expect(response.status).toBe(200);
    const detail = await response.json() as { userId: string; membershipStatus: string; accountStatus: string };
    expect(detail).toMatchObject({ userId: f.subjectA, membershipStatus: "removed", accountStatus: "active" });
    expect(detail).toHaveProperty("accountId", f.accountId);
    const rejoin = await dispatchApi(buildRequest("POST", `/api/v1/apps/${f.appA}/memberships`, { csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: ownerSession.token }, body: { accountId: f.accountId } }));
    expect(rejoin.status).toBe(200);
    expect(await rejoin.json()).toMatchObject({ userId: f.subjectA, membershipStatus: "active" });
    const bad = await dispatchApi(buildRequest("POST", `/api/v1/apps/${f.appA}/memberships`, { csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: ownerSession.token }, body: { accountId: "invalid" } }));
    expect(bad.status).toBe(400);
    const [audit] = await getDb()`SELECT COUNT(*)::int AS count FROM audit_events WHERE action = 'application_membership.removed' AND resource_id = ${f.subjectA}`;
    expect(Number(audit.count)).toBe(1);
  });
});
