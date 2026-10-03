import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { getDb, closeDatabase } from "../../src/api/lib/db";
import { createApp, patchApp } from "../../src/api/lib/apps";
import { createClient, patchClient } from "../../src/api/lib/oauth-clients";
import { createSession, SESSION_COOKIE } from "../../src/api/lib/session";
import { generateTotpCode } from "../../src/api/lib/totp";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { sha256Hex } from "../../src/api/lib/crypto";
import { purgeExpiredRegistrations } from "../../src/api/lib/registration-lifecycle";
import { createServiceGroup } from "../../src/api/lib/service-groups";
import { ensureApplicationSubject } from "../../src/api/lib/accounts";
import { createAppSession } from "../../src/api/lib/app-session";
import { findActiveOAuthClient, issueAuthorizationCode, exchangeAuthorizationCode, exchangeRefreshToken, issueClientCredentialsToken } from "../../src/api/lib/oauth";
import { createResource, putClientResource } from "../../src/api/lib/oauth-resources";
import { createPostgresOAuthConsentChallengeAuthority } from "../../src/api/lib/oauth-consent-challenges";
import { createAuthorizationServer } from "../../src/capabilities/authorization-server";
import { dispatchWeb } from "./web-dispatch";
import { dispatchApi } from "./api-routes";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { makeStrongPassword } from "../helpers/password";
import { testResourceForClient } from "../helpers/resources";
import type { CreateClientRequest, CreateAppResponse, CreateClientResponse, RegistrationLifecycleAction } from "@z0/contracts/apps";

const run = hasTestDatabase() ? describe : describe.skip;
const redirect = "http://localhost:3000/callback";
const config: CreateClientRequest = { label: "Server", clientType: "confidential", purpose: "interactive", redirectUris: [redirect], refreshEnabled: true };
run("Application and Client lifecycle (APP-09–APP-14)", () => {
  const password = makeStrongPassword();
  let cookie: string, csrf: string, userId: string;
  const priorGrace = process.env.REGISTRATION_DELETION_GRACE_DAYS;
  beforeAll(async () => {
    await resetTestDatabase();
    process.env.REGISTRATION_DELETION_GRACE_DAYS = "30";
    csrf = await fetchCsrfToken(dispatchApi);
    const setup = await dispatchApi(buildRequest("POST", "/api/setup", { csrfToken: csrf, body: { name: "Owner", email: "owner@example.com", password, passwordConfirm: password, organizationName: "Test" } }));
    expect(setup.status).toBe(201);
    const [owner] = await getDb()`SELECT user_id FROM instance_members WHERE is_bootstrap`;
    userId = String(owner.user_id);
    cookie = (await createSession(userId, buildRequest("GET", "/"))).token;
  });
  beforeEach(resetRateLimitsForTests);
  afterAll(async () => {
    if (priorGrace === undefined) delete process.env.REGISTRATION_DELETION_GRACE_DAYS;
    else process.env.REGISTRATION_DELETION_GRACE_DAYS = priorGrace;
    await closeDatabase();
  });
  async function api(path: string, body?: unknown, token?: string, csrfEnabled = true, sessionToken = cookie) {
    const req = buildRequest("POST", path, { body, csrfToken: csrfEnabled ? csrf : undefined, cookies: { [SESSION_COOKIE]: sessionToken } });
    if (token) req.headers.set("X-Registration-Verification", token);
    return dispatchApi(req);
  }
  async function app(): Promise<CreateAppResponse> {
    const result = await createApp({ name: `Product ${crypto.randomUUID()}`, initialClient: config });
    if (!result.ok) throw new Error(await result.response.text());
    return result.data;
  }
  async function sibling(appId: string, workload = false): Promise<CreateClientResponse> {
    const result = await createClient(appId, workload ? { label: "Worker", clientType: "confidential", purpose: "workload" } : config);
    if (!result.ok) throw new Error(await result.response.text());
    return result.data;
  }
  function path(a: CreateAppResponse, client?: CreateClientResponse) {
    return `/api/v1/apps/${a.app.id}${client ? `/clients/${client.client.id}` : ""}/lifecycle`;
  }
  function body(a: CreateAppResponse, action: RegistrationLifecycleAction, client?: CreateClientResponse) {
    return { action, expectedGraceDays: action === "delete" ? Number(process.env.REGISTRATION_DELETION_GRACE_DAYS) : undefined, confirmation: client ? client.client.clientId : a.app.id };
  }
  async function verifiedRequest(a: CreateAppResponse, action: RegistrationLifecycleAction, client?: CreateClientResponse) {
    const route = path(a, client), input = body(a, action, client);
    const first = await api(route, input);
    if (action === "restore") return first;
    expect(first.status).toBe(403);
    const challenge = await first.json();
    expect(challenge.errors[0].code).toBe("primary_reauthentication_required");
    expect(challenge.registrationVerification).toBeString();
    expect((await api("/api/auth/reauthenticate", { password })).status).toBe(200);
    return api(route, input, challenge.registrationVerification);
  }
  async function identity(a: CreateAppResponse) {
    const [row] = await getDb()`INSERT INTO app_users (app_id, email, name, metadata)
      VALUES (${a.app.id}, 'person@example.com', 'Person', '{"app":"metadata"}') RETURNING id, account_id, account_domain_id`;
    return row;
  }
  async function grant(a: CreateAppResponse, c: CreateClientResponse = a, subject?: string) {
    const id = subject ?? String((await identity(a)).id);
    const resource = await testResourceForClient(c.client.id);
    const client = (await findActiveOAuthClient(c.client.clientId))!;
    const code = await issueAuthorizationCode({ appId: a.app.id, appUserId: id, appCredentialId: c.client.id, redirectUri: redirect, resource, scope: "openid", codeChallenge: null, codeChallengeMethod: null, nonce: null });
    const tokens = await exchangeAuthorizationCode({ code, client, redirectUri: redirect });
    if (!tokens.ok || !tokens.refreshToken) throw new Error("Expected renewable grant");
    const unused = await issueAuthorizationCode({ appId: a.app.id, appUserId: id, appCredentialId: c.client.id, redirectUri: redirect, resource, scope: "openid", codeChallenge: null, codeChallengeMethod: null, nonce: null });
    return { client, tokens, unused, id, resource };
  }

  test("client containment preserves siblings, accounts and subjects; enable cannot revive codes or refresh", async () => {
    const a = await app(), b = await sibling(a.app.id), worker = await sibling(a.app.id, true);
    const state = await grant(a), other = await grant(a, b, state.id);
    const resource = await testResourceForClient(worker.client.id);
    const staleWorker = (await findActiveOAuthClient(worker.client.clientId))!;
    expect((await issueClientCredentialsToken({ client: staleWorker, scope: "openid", resource })).ok).toBe(true);
    expect((await patchClient(a.app.id, a.client.id, { status: "disabled" })).ok).toBe(true);
    expect(await findActiveOAuthClient(a.client.clientId)).toBeNull();
    const authorize = await dispatchWeb(new Request(`http://localhost/oauth/authorize?response_type=code&client_id=${a.client.clientId}&redirect_uri=${encodeURIComponent(redirect)}&resource=${encodeURIComponent(state.resource)}&scope=openid`));
    expect(authorize.status).toBe(400);
    expect((await exchangeRefreshToken({ refreshToken: state.tokens.refreshToken!, client: state.client })).ok).toBe(false);
    expect((await exchangeRefreshToken({ refreshToken: other.tokens.refreshToken!, client: other.client })).ok).toBe(true);
    expect((await patchClient(a.app.id, worker.client.id, { status: "disabled" })).ok).toBe(true);
    expect((await issueClientCredentialsToken({ client: staleWorker, scope: "openid", resource })).ok).toBe(false);
    expect((await patchClient(a.app.id, a.client.id, { status: "active" })).ok).toBe(true);
    expect((await exchangeAuthorizationCode({ code: state.unused, client: state.client, redirectUri: redirect })).ok).toBe(false);
    expect((await exchangeRefreshToken({ refreshToken: state.tokens.refreshToken!, client: state.client })).ok).toBe(false);
    const fresh = await grant(a, a, state.id);
    expect(fresh.tokens.refreshToken).toBeString();
    expect(await getDb()`SELECT id FROM accounts WHERE id = (SELECT account_id FROM app_account_bindings WHERE id = ${state.id})`).toHaveLength(1);
  });
  test("Pending Deletion preserves configuration; restore retains IDs without reviving renewable authority", async () => {
    const a = await app(), siblingClient = await sibling(a.app.id);
    const state = await grant(a);
    const response = await verifiedRequest(a, "delete", a);
    expect(response.status).toBe(200);
    const pending = await response.json();
    expect(pending.status).toBe("pending_deletion");
    expect(new Date(pending.registration.purgeAfter).getTime() - new Date(pending.registration.deletionStartedAt).getTime()).toBe(30 * 86400000);
    expect(await findActiveOAuthClient(siblingClient.client.clientId)).not.toBeNull();
    expect((await patchClient(a.app.id, a.client.id, { status: "active" })).ok).toBe(false);
    expect((await verifiedRequest(a, "restore", a)).status).toBe(200);
    expect((await findActiveOAuthClient(a.client.clientId))?.clientId).toBe(a.client.clientId);
    expect((await exchangeRefreshToken({ refreshToken: state.tokens.refreshToken!, client: state.client })).ok).toBe(false);
    expect((await exchangeAuthorizationCode({ code: state.unused, client: state.client, redirectUri: redirect })).ok).toBe(false);
    const deleted = await verifiedRequest(a, "delete");
    expect(deleted.status).toBe(200);
    expect(await findActiveOAuthClient(siblingClient.client.clientId)).toBeNull();
    expect((await patchApp(a.app.id, { status: "active" })).ok).toBe(false);
    expect((await verifiedRequest(a, "restore")).status).toBe(200);
    expect(await findActiveOAuthClient(siblingClient.client.clientId)).not.toBeNull();
  });
  test("delete and purge enforce confirmation, CSRF, permission, fresh verification, action binding and one use", async () => {
    const a = await app();
    expect((await api(path(a), body(a, "delete"), undefined, false)).status).toBe(403);
    expect((await api(path(a), { ...body(a, "delete"), confirmation: "wrong" })).status).toBe(400);
    expect((await api(path(a), { ...body(a, "delete"), expectedGraceDays: 0 })).status).toBe(409);
    expect((await api(path(a), body(a, "purge"))).status).toBe(409);
    const [viewer] = await getDb()`INSERT INTO users (name, email) VALUES ('Viewer', 'viewer-lifecycle@example.com') RETURNING id`;
    await getDb()`INSERT INTO instance_members (user_id) VALUES (${viewer.id})`;
    await getDb()`INSERT INTO instance_member_roles (member_user_id, role_id) SELECT ${viewer.id}, id FROM instance_roles WHERE key = 'viewer'`;
    const viewerSession = await createSession(String(viewer.id), buildRequest("GET", "/"));
    expect((await api(path(a), body(a, "delete"), undefined, true, viewerSession.token)).status).toBe(403);
    const first = await api(path(a), body(a, "delete"));
    expect(first.status).toBe(403);
    const proof = (await first.json()).registrationVerification;
    expect((await api(path(a), body(a, "delete"), proof)).status).toBe(403); // unverified
    expect((await api("/api/auth/reauthenticate", { password })).status).toBe(200);
    expect((await api(path(a), body(a, "delete"), proof)).status).toBe(200);
    expect((await api(path(a), body(a, "purge"), proof)).status).toBe(403); // different action
    expect((await verifiedRequest(a, "restore")).status).toBe(200);
    expect((await api(path(a), body(a, "delete"), proof)).status).toBe(403); // consumed
    const b = await app();
    const token = (await (await api(path(a), body(a, "delete"))).json()).registrationVerification;
    expect((await api(path(b), body(b, "delete"), token)).status).toBe(403);
    await getDb()`UPDATE registration_lifecycle_verifications SET expires_at = NOW() - INTERVAL '1 second' WHERE token_hash = ${await sha256Hex(token)}`;
    expect((await api(path(a), body(a, "delete"), token)).status).toBe(403);
  });
  test("client purge removes configuration and protocol state, reserves its ID and leaves Application identity intact", async () => {
    const a = await app(); const state = await grant(a); const other = await sibling(a.app.id);
    expect((await verifiedRequest(a, "delete", a)).status).toBe(200);
    expect((await verifiedRequest(a, "purge", a)).status).toBe(200);
    expect(await getDb()`SELECT id FROM oauth_clients WHERE id = ${a.client.id}`).toHaveLength(0);
    expect(await getDb()`SELECT id FROM oauth_refresh_tokens WHERE app_credential_id = ${a.client.id}`).toHaveLength(0);
    expect(await getDb()`SELECT id FROM oauth_grants WHERE client_id = ${a.client.id}`).toHaveLength(0);
    expect(await getDb()`SELECT client_id FROM retired_oauth_client_ids WHERE client_id = ${a.client.clientId}`).toHaveLength(1);
    expect(await findActiveOAuthClient(other.client.clientId)).not.toBeNull();
    expect(await getDb()`SELECT id FROM app_account_bindings WHERE id = ${state.id}`).toHaveLength(1);
    await expect((async () => await getDb()`INSERT INTO oauth_clients(app_id, client_id, client_type, purpose, label, redirect_uris)
      VALUES (${a.app.id}, ${a.client.clientId}, 'public', 'interactive', 'Reuse', ARRAY[${redirect}])`)()).rejects.toThrow();
    await expect((async () => await getDb()`DELETE FROM retired_oauth_client_ids WHERE client_id = ${a.client.clientId}`)()).rejects.toThrow();
  });
  test("Application purge removes private domain credentials and metadata, preserves reserved Resource audiences", async () => {
    const a = await app(), untouched = await app(); const state = await grant(a); const other = await identity(untouched);
    const [account] = await getDb()`SELECT account_id, account_domain_id FROM app_account_bindings WHERE id = ${state.id}`;
    await getDb()`INSERT INTO app_user_passkey_handles(app_user_id, app_id, user_handle) VALUES (${state.id}, ${a.app.id}, 'private-handle')`;
    expect((await verifiedRequest(a, "delete")).status).toBe(200);
    expect((await verifiedRequest(a, "purge")).status).toBe(200);
    for (const rows of [await getDb()`SELECT id FROM apps WHERE id = ${a.app.id}`, await getDb()`SELECT id FROM accounts WHERE id = ${account.account_id}`, await getDb()`SELECT id FROM account_domains WHERE id = ${account.account_domain_id}`, await getDb()`SELECT app_user_id FROM app_user_passkey_handles WHERE account_id = ${account.account_id}`]) expect(rows).toHaveLength(0);
    const [retired] = await getDb()`SELECT app_id, status FROM oauth_resources WHERE audience = ${state.resource}`;
    expect(retired.status).toBe("retired"); expect(retired.app_id).toBeNull();
    expect((await createResource(untouched.app.id, { name: "Reuse", audience: state.resource, scopes: [] })).ok).toBe(false);
    expect(await getDb()`SELECT id FROM accounts WHERE id = ${other.account_id}`).toHaveLength(1);
  });
  test("Application disable/delete/purge preserves shared SSO Account, source authenticators and sibling sessions", async () => {
    const a = await app(), b = await app();
    const group = await createServiceGroup({ name: "Shared", appIds: [a.app.id, b.app.id] });
    if (!group.ok) throw new Error("Expected group");
    const source = await identity(a);
    const joined = await getDb().begin(tx => ensureApplicationSubject(tx, b.app.id, String(source.account_id)));
    if (!joined) throw new Error("Expected shared subject");
    await getDb()`INSERT INTO application_memberships (subject_id) VALUES (${joined}) ON CONFLICT DO NOTHING`;
    await getDb()`INSERT INTO app_user_passkey_handles (app_user_id, app_id, user_handle) VALUES (${source.id}, ${a.app.id}, 'shared-handle')`;
    const session = await createAppSession(joined, b.app.id, buildRequest("GET", "/"));
    expect((await patchApp(a.app.id, { status: "disabled" })).ok).toBe(true);
    expect(await findActiveOAuthClient(b.client.clientId)).not.toBeNull();
    expect((await patchApp(a.app.id, { status: "active" })).ok).toBe(true);
    expect((await verifiedRequest(a, "delete")).status).toBe(200);
    expect((await verifiedRequest(a, "purge")).status).toBe(200);
    expect(await getDb()`SELECT id FROM accounts WHERE id = ${source.account_id}`).toHaveLength(1);
    expect(await getDb()`SELECT app_user_id FROM app_user_passkey_handles WHERE account_id = ${source.account_id}`).toHaveLength(1);
    expect(await getDb()`SELECT s.id FROM app_user_sessions s JOIN app_browser_sessions b ON b.id = s.browser_session_id WHERE b.token_hash = ${await sha256Hex(session.token)} AND s.revoked_at IS NULL AND b.revoked_at IS NULL`).toHaveLength(1);
    expect(await findActiveOAuthClient(b.client.clientId)).not.toBeNull();
  });
  test("grace expiry disallows late recovery and maintenance purges once; zero grace is immediate", async () => {
    const a = await app();
    expect((await verifiedRequest(a, "delete", a)).status).toBe(200);
    await getDb()`UPDATE oauth_clients SET purge_after = NOW() - INTERVAL '1 second' WHERE id = ${a.client.id}`;
    expect((await verifiedRequest(a, "restore", a)).status).toBe(409);
    const counts = await Promise.all([purgeExpiredRegistrations(), purgeExpiredRegistrations()]);
    expect(counts.reduce((n, c) => n + c, 0)).toBe(1);
    expect(await getDb()`SELECT id FROM apps WHERE id = ${a.app.id}`).toHaveLength(1);
    expect((await verifiedRequest(a, "delete")).status).toBe(200);
    await getDb()`UPDATE apps SET purge_after = NOW() - INTERVAL '1 second' WHERE id = ${a.app.id}`;
    expect((await verifiedRequest(a, "restore")).status).toBe(409);
    expect(await purgeExpiredRegistrations()).toBe(1);
    process.env.REGISTRATION_DELETION_GRACE_DAYS = "0";
    const instant = await app();
    expect((await (await verifiedRequest(instant, "delete", instant)).json()).status).toBe("purged");
    expect((await (await verifiedRequest(instant, "delete")).json()).status).toBe("purged");
    process.env.REGISTRATION_DELETION_GRACE_DAYS = "30";
  });
  test("expired purge rolls back all state on audit failure and remains retryable", async () => {
    const a = await app(); const state = await grant(a);
    expect((await verifiedRequest(a, "delete")).status).toBe(200);
    await getDb()`UPDATE apps SET purge_after = clock_timestamp() - INTERVAL '1 second' WHERE id = ${a.app.id}`;
    await getDb().unsafe(`CREATE FUNCTION reject_test_lifecycle_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action = 'app.purged' THEN RAISE EXCEPTION 'injected audit failure'; END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER test_lifecycle_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_test_lifecycle_audit();`);
    try {
      await expect(purgeExpiredRegistrations()).rejects.toThrow("injected audit failure");
      expect(await getDb()`SELECT id FROM apps WHERE id = ${a.app.id} AND status = 'pending_deletion'`).toHaveLength(1);
      expect(await getDb()`SELECT id FROM oauth_clients WHERE id = ${a.client.id}`).toHaveLength(1);
      expect(await getDb()`SELECT client_id FROM retired_oauth_client_ids WHERE client_id = ${a.client.clientId}`).toHaveLength(0);
      expect((await getDb()`SELECT status, app_id FROM oauth_resources WHERE audience = ${state.resource}`)[0]).toMatchObject({ status: "active", app_id: a.app.id });
    } finally {
      await getDb().unsafe("DROP TRIGGER test_lifecycle_audit ON audit_events; DROP FUNCTION reject_test_lifecycle_audit();");
    }
    expect(await purgeExpiredRegistrations()).toBe(1);
    expect(await purgeExpiredRegistrations()).toBe(0);
  });
  test("recovery waiting across its deadline cannot race an expired purge into resurrecting the registration", async () => {
    const a = await app();
    expect((await verifiedRequest(a, "delete")).status).toBe(200);
    let release!: () => void, ready!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const locked = new Promise<void>(resolve => { ready = resolve; });
    const blocker = getDb().begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtext('z0:resource-authority'))`;
      await tx`UPDATE apps SET purge_after = clock_timestamp() + INTERVAL '100 milliseconds' WHERE id = ${a.app.id}`;
      ready(); await hold;
    });
    await locked;
    const restoring = api(path(a), body(a, "restore"));
    const expiring = purgeExpiredRegistrations();
    await Bun.sleep(150);
    release(); await blocker;
    expect([404, 409]).toContain((await restoring).status);
    expect(await expiring).toBe(1);
    expect(await getDb()`SELECT id FROM apps WHERE id = ${a.app.id}`).toHaveLength(0);
  });
  test("disabling an Application invalidates all child renewable state and re-enable allows only fresh use", async () => {
    const a = await app(); const b = await sibling(a.app.id); const first = await grant(a), second = await grant(a, b, first.id);
    const worker = await sibling(a.app.id, true), resource = await testResourceForClient(worker.client.id);
    const staleWorker = (await findActiveOAuthClient(worker.client.clientId))!;
    await Promise.all([patchApp(a.app.id, { status: "disabled" }), exchangeRefreshToken({ refreshToken: first.tokens.refreshToken!, client: first.client }), issueClientCredentialsToken({ client: staleWorker, resource, scope: "openid" })]);
    expect(await getDb()`SELECT id FROM oauth_refresh_tokens WHERE app_id = ${a.app.id} AND revoked_at IS NULL`).toHaveLength(0);
    expect((await issueClientCredentialsToken({ client: staleWorker, resource, scope: "openid" })).ok).toBe(false);
    expect((await patchApp(a.app.id, { status: "active" })).ok).toBe(true);
    for (const s of [first, second]) {
      expect((await exchangeRefreshToken({ refreshToken: s.tokens.refreshToken!, client: s.client })).ok).toBe(false);
      expect((await exchangeAuthorizationCode({ code: s.unused, client: s.client, redirectUri: redirect })).ok).toBe(false);
    }
    expect((await issueClientCredentialsToken({ client: staleWorker, resource, scope: "openid" })).ok).toBe(true);
  });
  test("delete racing refresh/code issuance leaves no live renewable state, and purge racing stale exchange fails safely", async () => {
    const a = await app(); const state = await grant(a);
    const input = body(a, "delete", a), route = path(a, a);
    const challenge = (await (await api(route, input)).json()).registrationVerification;
    await api("/api/auth/reauthenticate", { password });
    const authorization = createAuthorizationServer({ consentChallenges: createPostgresOAuthConsentChallengeAuthority() });
    const consent = { responseType: "code" as const, appId: a.app.id, appUserId: state.id,
      clientId: a.client.clientId, redirectUri: redirect, resource: state.resource, scope: "openid",
      state: "deletion-race", codeChallenge: null, codeChallengeMethod: null, oidcNonce: null };
    const outcomes = await Promise.allSettled([
      api(route, input, challenge),
      authorization.beginConsent(consent),
      exchangeRefreshToken({ refreshToken: state.tokens.refreshToken!, client: state.client }),
      issueAuthorizationCode({ appId: a.app.id, appUserId: state.id, appCredentialId: a.client.id, redirectUri: redirect, resource: state.resource, scope: "openid", codeChallenge: null, codeChallengeMethod: null, nonce: null }),
    ]);
    expect(outcomes[0].status).toBe("fulfilled");
    expect(outcomes[0].status === "fulfilled" && outcomes[0].value.status).toBe(200);
    expect(await getDb()`SELECT id FROM oauth_refresh_tokens WHERE app_credential_id = ${a.client.id} AND revoked_at IS NULL`).toHaveLength(0);
    expect(await getDb()`SELECT id FROM oauth_authorization_codes WHERE app_credential_id = ${a.client.id} AND used_at IS NULL`).toHaveLength(0);
    expect(await getDb()`SELECT id FROM oauth_consent_challenges WHERE app_credential_id = ${a.client.id} AND consumed_at IS NULL`).toHaveLength(0);
    const purgeInput = body(a, "purge", a);
    const purgeProof = (await (await api(route, purgeInput)).json()).registrationVerification;
    expect((await api("/api/auth/reauthenticate", { password })).status).toBe(200);
    const [purged, staleCode, staleRefresh] = await Promise.all([
      api(route, purgeInput, purgeProof),
      exchangeAuthorizationCode({ code: state.unused, client: state.client, redirectUri: redirect }),
      exchangeRefreshToken({ refreshToken: state.tokens.refreshToken!, client: state.client }),
    ]);
    expect(purged.status).toBe(200); expect(staleCode.ok).toBe(false); expect(staleRefresh.ok).toBe(false);
    expect((await exchangeAuthorizationCode({ code: state.unused, client: state.client, redirectUri: redirect })).ok).toBe(false);
    expect((await exchangeRefreshToken({ refreshToken: state.tokens.refreshToken!, client: state.client })).ok).toBe(false);
  });
  test("a fresh password cannot satisfy action verification when the Operator has MFA", async () => {
    const a = await app();
    const enrollmentResponse = await api("/api/auth/mfa/enrollment");
    expect(enrollmentResponse.status).toBe(201);
    const enrollment = await enrollmentResponse.json();
    expect((await api("/api/auth/mfa/enrollment/confirm", { code: await generateTotpCode(enrollment.secret, Date.now() - 30000) })).status).toBe(200);
    const challengeResponse = await api(path(a), body(a, "delete"));
    expect(challengeResponse.status).toBe(403);
    const challenge = await challengeResponse.json();
    expect(challenge.errors[0].code).toBe("mfa_step_up_required");
    expect((await api("/api/auth/reauthenticate", { password })).status).toBe(200);
    expect((await api(path(a), body(a, "delete"), challenge.registrationVerification)).status).toBe(403);
    const otherSession = await createSession(userId, buildRequest("GET", "/"));
    expect((await api(path(a), body(a, "delete"), challenge.registrationVerification, true, otherSession.token)).status).toBe(403);
    expect((await api("/api/auth/mfa/step-up", { code: await generateTotpCode(enrollment.secret) })).status).toBe(200);
    expect((await api(path(a), body(a, "delete"), challenge.registrationVerification)).status).toBe(200);
  });

});
