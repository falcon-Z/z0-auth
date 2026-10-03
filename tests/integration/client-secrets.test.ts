import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import { createApp, patchApp } from "../../src/api/lib/apps";
import { createClient, patchClient } from "../../src/api/lib/oauth-clients";
import { createClientSecret, listClientSecrets, revokeClientSecret } from "../../src/api/lib/client-secrets";
import { findActiveOAuthClient, verifyOAuthClientSecret, issueClientCredentialsToken, issueAuthorizationCode, exchangeAuthorizationCode, exchangeRefreshToken, findOAuthAccessToken } from "../../src/api/lib/oauth";
import { createSession, SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { testResourceForClient } from "../helpers/resources";
import { dispatchApi } from "./api-routes";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;
const redirect = "http://localhost:3000/callback";
run("APP-21–APP-29 independent Client secrets", () => {
  let cookie: string, csrf: string, actor: string;
  const api = (method: string, path: string, body?: unknown, options: { csrf?: boolean; cookie?: string } = {}) => dispatchApi(buildRequest(method, path, {
    body, csrfToken: options.csrf === false ? undefined : csrf, cookies: { [SESSION_COOKIE]: options.cookie ?? cookie },
  }));
  async function fixture(purpose: "workload" | "interactive" = "workload") {
    const res = await api("POST", "/api/v1/apps", { name: `Secrets ${crypto.randomUUID()}`, initialClient: {
      label: "Server", clientType: "confidential", purpose, ...(purpose === "interactive" ? { redirectUris: [redirect], refreshEnabled: true } : {}),
    } });
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const f = await res.json();
    f.path = `/api/v1/apps/${f.app.id}/clients/${f.client.id}/secrets`;
    f.resource = await testResourceForClient(f.client.id);
    return f;
  }
  async function token(f: any, secret: string, basic = false, extra: Record<string, string> = {}) {
    const body = new URLSearchParams({ grant_type: "client_credentials", resource: f.resource, ...extra });
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (basic) headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(f.client.clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`;
    else { body.set("client_id", f.client.clientId); body.set("client_secret", secret); }
    return dispatchWeb(new Request("http://localhost/oauth/token", { method: "POST", headers, body }));
  }
  beforeAll(async () => {
    await resetTestDatabase();
    csrf = await fetchCsrfToken(dispatchApi);
    const password = makeStrongPassword();
    expect((await dispatchApi(buildRequest("POST", "/api/setup", { csrfToken: csrf, body: { name: "Owner", email: "secret-owner@example.com", password, passwordConfirm: password, organizationName: "Secrets" } }))).status).toBe(201);
    const login = await dispatchApi(buildRequest("POST", "/api/auth/login", { csrfToken: csrf, body: { email: "secret-owner@example.com", password } }));
    cookie = decodeURIComponent(login.headers.getSetCookie().find(c => c.startsWith(`${SESSION_COOKIE}=`))!.split(";")[0]!.slice(SESSION_COOKIE.length + 1));
    actor = (await getDb()`SELECT id FROM users WHERE email = 'secret-owner@example.com'`)[0].id;
  });
  afterAll(closeDatabase);
  test("two secrets authenticate one Client using both advertised methods; revocation isolates the chosen secret", async () => {
    const f = await fixture();
    const res = await api("POST", f.path, { label: "Replacement", replacementFor: f.secret.id });
    expect(res.status).toBe(201); expect(res.headers.get("Cache-Control")).toBe("no-store");
    const second = await res.json();
    expect(second.secret.clientId).toBe(f.client.id);
    expect(second.secret.createdBy).toBe(actor);
    expect(second.secret.status).toBe("active"); expect(second.secret.expiresAt).toBeNull();
    expect(second.secret.lastUsedAt).toBeNull();
    const oldToken = await (await token(f, f.clientSecret)).json();
    expect(oldToken.access_token).toBeString();
    expect((await token(f, second.clientSecret, true)).status).toBe(200);
    expect((await token(f, f.clientSecret, true)).status).toBe(200);
    expect((await token(f, second.clientSecret)).status).toBe(200);
    expect((await api("POST", `${f.path}/${f.secret.id}/revoke`, { reason: "ordinary" })).status).toBe(200);
    expect((await token(f, f.clientSecret)).status).toBe(401);
    expect((await token(f, second.clientSecret, true)).status).toBe(200);
    expect((await findOAuthAccessToken(oldToken.access_token))?.revokedAt).toBeNull();
    const discovery = await (await dispatchWeb(new Request("http://localhost/.well-known/openid-configuration"))).json();
    expect(discovery.token_endpoint_auth_methods_supported).toEqual(["client_secret_basic", "client_secret_post", "none"]);
  });
  test("only safe metadata is retrievable; storage and audit never contain values", async () => {
    const f = await fixture();
    const added = await (await api("POST", f.path, {})).json();
    for (const path of [f.path, `/api/v1/apps/${f.app.id}`, `/api/v1/apps/${f.app.id}/clients`]) {
      const text = await (await api("GET", path)).text();
      expect(text).not.toContain(f.clientSecret); expect(text).not.toContain(added.clientSecret);
      expect(text).not.toContain("secret_digest"); expect(text).not.toContain("clientSecret");
    }
    const [row] = await getDb()`SELECT * FROM client_secrets WHERE id = ${added.secret.id}`;
    expect(row.secret_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(row.secret_digest).not.toBe(added.clientSecret); expect(row.digest_algorithm).toBe("sha256");
    expect((await getDb()`SELECT * FROM oauth_clients WHERE id = ${f.client.id}`)[0].client_secret_hash).toBeUndefined();
    const events = await getDb()`SELECT * FROM audit_events WHERE resource_type = 'client_secret' AND resource_id = ${added.secret.id}`;
    expect(events).toHaveLength(1); expect(events[0].actor_user_id).toBe(actor);
    expect(JSON.stringify(events)).not.toContain(added.clientSecret);
  });
  test("last-successful-use belongs to each secret; failed attempts leave it untouched", async () => {
    const f = await fixture();
    const added = await (await api("POST", f.path, {})).json();
    expect((await token(f, f.clientSecret)).status).toBe(200);
    const before = (await (await api("GET", f.path)).json()).secrets;
    expect(before.find((s: any) => s.id === f.secret.id).lastUsedAt).toBeString();
    expect(before.find((s: any) => s.id === added.secret.id).lastUsedAt).toBeNull();
    expect((await token(f, f.clientSecret.slice(0, -1) + (f.clientSecret.endsWith("0") ? "1" : "0"))).status).toBe(401);
    const after = (await (await api("GET", f.path)).json()).secrets;
    expect(after).toEqual(before);
    const auth = (await findActiveOAuthClient(f.client.clientId))!;
    expect(await verifyOAuthClientSecret(auth, f.clientSecret)).toBe(true);
    expect(auth.authenticatedSecretId).toBe(f.secret.id);
  });
  test("optional expiry is enforced and expired alternatives do not defeat last-secret protection", async () => {
    const f = await fixture();
    const res = await api("POST", f.path, { label: "Expires", expiresAt: new Date(Date.now() + 60000).toISOString() });
    expect(res.status).toBe(201); const added = await res.json();
    expect((await token(f, added.clientSecret)).status).toBe(200);
    await getDb()`UPDATE client_secrets SET expires_at = clock_timestamp() - INTERVAL '1 second' WHERE id = ${added.secret.id}`;
    expect((await token(f, added.clientSecret, true)).status).toBe(401);
    const rows = (await (await api("GET", f.path)).json()).secrets;
    expect(rows.find((s: any) => s.id === added.secret.id).status).toBe("expired");
    expect((await api("POST", `${f.path}/${f.secret.id}/revoke`, { reason: "ordinary" })).status).toBe(409);
    expect((await api("POST", `${f.path}/${added.secret.id}/revoke`, { reason: "ordinary" })).status).toBe(200);
  });
  test("ordinary final revocation requires a deployed replacement; compromise revokes the final secret", async () => {
    const f = await fixture();
    const denied = await api("POST", `${f.path}/${f.secret.id}/revoke`, { reason: "ordinary" });
    expect(denied.status).toBe(409); expect((await denied.json()).detail).toContain("stop Client authentication");
    expect((await token(f, f.clientSecret)).status).toBe(200);
    const replacement = await (await api("POST", f.path, { replacementFor: f.secret.id })).json();
    expect((await api("POST", `${f.path}/${f.secret.id}/revoke`, { reason: "ordinary" })).status).toBe(200);
    expect((await api("POST", `${f.path}/${replacement.secret.id}/revoke`, { reason: "compromised" })).status).toBe(200);
    expect((await token(f, replacement.clientSecret)).status).toBe(401);
    expect((await findActiveOAuthClient(f.client.clientId))?.clientId).toBe(f.client.clientId);
    const event = (await getDb()`SELECT payload FROM audit_events WHERE action = 'client.secret_created' AND resource_id = ${replacement.secret.id}`)[0];
    expect((typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload).replacementFor).toBe(f.secret.id);
    expect((await api("POST", `${f.path}/${replacement.secret.id}/revoke`, { reason: "ordinary" })).status).toBe(200);
    expect(await getDb()`SELECT id FROM audit_events WHERE action = 'client.secret_revoked' AND resource_id = ${replacement.secret.id}`).toHaveLength(1);
    await expect((async () => { await getDb()`UPDATE client_secrets SET revoked_at = NULL, revocation_reason = NULL WHERE id = ${replacement.secret.id}`; })()).rejects.toThrow();
  });
  test("public clients receive no secret and reject secret authentication, including Basic", async () => {
    const f = await fixture();
    const result = await createClient(f.app.id, { label: "SPA", clientType: "public", purpose: "interactive", redirectUris: [redirect] });
    if (!result.ok) throw new Error("fixture"); const publicClient = result.data.client;
    expect(result.data.clientSecret).toBeNull(); expect(result.data.secret).toBeNull();
    const path = `/api/v1/apps/${f.app.id}/clients/${publicClient.id}/secrets`;
    expect((await api("POST", path, {})).status).toBe(409);
    expect((await (await api("GET", path)).json()).secrets).toHaveLength(0);
    const client = (await findActiveOAuthClient(publicClient.clientId))!;
    expect(await verifyOAuthClientSecret(client, undefined)).toBe(true);
    expect(await verifyOAuthClientSecret(client, f.clientSecret)).toBe(false);
    const pub = { ...f, client: publicClient };
    expect((await token(pub, "", false)).status).toBe(401);
    expect((await token(pub, "", true)).status).toBe(401);
    await expect((async () => { await getDb()`INSERT INTO client_secrets(client_id, secret_digest, digest_algorithm) VALUES (${publicClient.id}, 'digest', 'sha256')`; })()).rejects.toThrow();
  });
  test("secrets never cross Client or Application boundaries", async () => {
    const a = await fixture(), b = await fixture();
    expect((await token(b, a.clientSecret)).status).toBe(401);
    expect((await api("GET", `/api/v1/apps/${a.app.id}/clients/${b.client.id}/secrets`)).status).toBe(404);
    expect((await api("POST", `${a.path}/${b.secret.id}/revoke`, { reason: "compromised" })).status).toBe(404);
    expect((await api("POST", a.path, { replacementFor: b.secret.id })).status).toBe(404);
    await expect((async () => { await getDb()`UPDATE client_secrets SET client_id = ${b.client.id} WHERE id = ${a.secret.id}`; })()).rejects.toThrow();
  });
  test("validates optional metadata, body shape and expiry without creating secrets", async () => {
    const f = await fixture();
    for (const body of [ { label: " " }, { label: 123 }, { label: "x".repeat(65) }, { expiresAt: "2020-01-01T00:00:00Z" }, { expiresAt: "not a date" }, { expiresAt: "2035-02-30T00:00:00Z" }, { expiresAt: "2035-01-01T24:00:00Z" }, { expiresAt: 123 }, { expiresAt: "2030-01-01" }, { replacementFor: "bad" }, { secret: "user supplied" }, null, [] ])
      expect((await api("POST", f.path, body)).status).toBe(400);
    for (const body of [ {}, { reason: "oops" }, { reason: "ordinary", force: true } ])
      expect((await api("POST", `${f.path}/${f.secret.id}/revoke`, body)).status).toBe(400);
    expect((await (await api("GET", f.path)).json()).secrets).toHaveLength(1);
    expect((await api("GET", "/api/v1/apps/bad/clients/bad/secrets")).status).toBe(404);
  });
  test("management requires authentication, CSRF, separate read/add/revoke scopes and recent verification", async () => {
    const f = await fixture();
    expect((await dispatchApi(buildRequest("GET", f.path))).status).toBe(401);
    for (const path of [f.path, `${f.path}/${f.secret.id}/revoke`]) expect((await api("POST", path, {}, { csrf: false })).status).toBe(403);
    const [viewer] = await getDb()`INSERT INTO users(name, email) VALUES ('Viewer', ${`${crypto.randomUUID()}@example.com`}) RETURNING id`;
    await getDb()`INSERT INTO instance_members(user_id) VALUES (${viewer.id})`;
    await getDb()`INSERT INTO instance_member_roles(member_user_id, role_id) SELECT ${viewer.id}, id FROM instance_roles WHERE key = 'viewer'`;
    const session = await createSession(viewer.id, buildRequest("GET", "/"));
    expect((await api("GET", f.path, undefined, { cookie: session.token })).status).toBe(200);
    expect((await api("POST", f.path, {}, { cookie: session.token })).status).toBe(403);
    expect((await api("POST", `${f.path}/${f.secret.id}/revoke`, { reason: "compromised" }, { cookie: session.token })).status).toBe(403);
    const stale = await createSession(actor, buildRequest("GET", "/"), { primaryAuthenticatedAt: new Date(Date.now() - 3600000) });
    const denied = await api("POST", f.path, {}, { cookie: stale.token });
    expect(denied.status).toBe(403); expect(await denied.text()).toContain("primary_reauthentication_required");
  });
  test("disabled registrations cannot authenticate or add secrets; revocation survives re-enable", async () => {
    const f = await fixture();
    await patchClient(f.app.id, f.client.id, { status: "disabled" });
    expect((await token(f, f.clientSecret)).status).toBe(401);
    expect((await api("POST", f.path, {})).status).toBe(409);
    expect((await api("POST", `${f.path}/${f.secret.id}/revoke`, { reason: "ordinary" })).status).toBe(200);
    await patchClient(f.app.id, f.client.id, { status: "active" });
    expect((await token(f, f.clientSecret)).status).toBe(401);
    const replacement = await (await api("POST", f.path, {})).json();
    await patchApp(f.app.id, { status: "disabled" });
    expect((await token(f, replacement.clientSecret)).status).toBe(401);
    expect((await api("POST", f.path, {})).status).toBe(409);
  });
  test("concurrent ordinary revocations cannot remove both remaining usable secrets", async () => {
    const f = await fixture(); const added = await (await api("POST", f.path, {})).json();
    const responses = await Promise.all([f.secret.id, added.secret.id].map(id => api("POST", `${f.path}/${id}/revoke`, { reason: "ordinary" })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const listed = (await (await api("GET", f.path)).json()).secrets;
    expect(listed.filter((s: any) => s.status === "active")).toHaveLength(1);
  });
  test("add and revoke authority are independently enforced", async () => {
    const f = await fixture();
    const [user] = await getDb()`INSERT INTO users(name, email) VALUES ('Secret manager', ${`${crypto.randomUUID()}@example.com`}) RETURNING id`;
    await getDb()`INSERT INTO instance_members(user_id) VALUES (${user.id})`;
    const [role] = await getDb()`INSERT INTO instance_roles(key, name) VALUES (${`secret-manager-${user.id}`}, 'Secret manager') RETURNING id`;
    await getDb()`INSERT INTO instance_member_roles(member_user_id, role_id) VALUES (${user.id}, ${role.id})`;
    await getDb()`INSERT INTO instance_role_scopes(role_id, scope_key) VALUES (${role.id}, 'apps.clients:read'), (${role.id}, 'apps.clients:rotate')`;
    const session = await createSession(user.id, buildRequest("GET", "/"));
    expect((await api("POST", f.path, {}, { cookie: session.token })).status).toBe(201);
    expect((await api("POST", `${f.path}/${f.secret.id}/revoke`, { reason: "ordinary" }, { cookie: session.token })).status).toBe(403);
    await getDb()`DELETE FROM instance_role_scopes WHERE role_id = ${role.id} AND scope_key = 'apps.clients:rotate'`;
    await getDb()`INSERT INTO instance_role_scopes(role_id, scope_key) VALUES (${role.id}, 'apps.clients:revoke')`;
    expect((await api("POST", f.path, {}, { cookie: session.token })).status).toBe(403);
    expect((await api("POST", `${f.path}/${f.secret.id}/revoke`, { reason: "ordinary" }, { cookie: session.token })).status).toBe(200);
  });
  test("authentication and issuance waiting on management observe committed revocation", async () => {
    const f = await fixture(); const client = (await findActiveOAuthClient(f.client.clientId))!;
    expect(await verifyOAuthClientSecret(client, f.clientSecret)).toBe(true);
    let issuance: ReturnType<typeof issueClientCredentialsToken> | undefined;
    let authentication: ReturnType<typeof token> | undefined;
    try {
      await getDb().begin(async tx => {
        const [parent] = await tx`SELECT id, pg_backend_pid() AS pid FROM apps WHERE id = ${f.app.id} FOR UPDATE`;
        issuance = issueClientCredentialsToken({ client, scope: "", resource: f.resource });
        authentication = token(f, f.clientSecret);
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const [blocked] = await getDb()`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE ${parent.pid}::int = ANY(pg_blocking_pids(pid))`;
          if (blocked.count >= 2) { waiting = true; break; }
          await Bun.sleep(10);
        }
        expect(waiting).toBe(true);
        await tx`UPDATE client_secrets SET revoked_at = clock_timestamp(), revocation_reason = 'compromised' WHERE id = ${f.secret.id}`;
      });
      expect(await issuance!).toEqual({ ok: false, error: "invalid_client" });
      expect((await authentication!).status).toBe(401);
      expect(await getDb()`SELECT id FROM oauth_grants WHERE client_id = ${f.client.id}`).toHaveLength(0);
    } finally { await Promise.all([issuance, authentication]); }
  });
  test("expiry during a transaction lock wait uses wall time rather than transaction start time", async () => {
    const f = await fixture(); const client = (await findActiveOAuthClient(f.client.clientId))!;
    expect(await verifyOAuthClientSecret(client, f.clientSecret)).toBe(true);
    let issuance: ReturnType<typeof issueClientCredentialsToken> | undefined;
    try {
      await getDb().begin(async tx => {
        const [parent] = await tx`SELECT id, pg_backend_pid() AS pid FROM apps WHERE id = ${f.app.id} FOR UPDATE`;
        await tx`UPDATE client_secrets SET expires_at = clock_timestamp() + INTERVAL '250 milliseconds' WHERE id = ${f.secret.id}`;
        issuance = issueClientCredentialsToken({ client, scope: "", resource: f.resource });
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const [blocked] = await getDb()`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${parent.pid}::int = ANY(pg_blocking_pids(pid))) AS waiting`;
          if (blocked.waiting) { waiting = true; break; }
          await Bun.sleep(10);
        }
        expect(waiting).toBe(true);
        await tx`SELECT pg_sleep(0.3)`;
      });
      expect(await issuance!).toEqual({ ok: false, error: "invalid_client" });
      expect(await getDb()`SELECT id FROM oauth_grants WHERE client_id = ${f.client.id}`).toHaveLength(0);
    } finally { await issuance; }
  });
  test("audit failure rolls back initial Client creation, added secrets and revocation", async () => {
    const f = await fixture();
    await getDb().unsafe(`CREATE FUNCTION reject_secret_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'client.secret_%' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_secret_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_secret_audit();`);
    try {
      await expect(createClientSecret(f.app.id, f.client.id, {}, actor)).rejects.toThrow("audit unavailable");
      await expect(revokeClientSecret(f.app.id, f.client.id, f.secret.id, { reason: "compromised" }, actor)).rejects.toThrow("audit unavailable");
      await expect(createApp({ name: "Audit failure", initialClient: { label: "Worker", clientType: "confidential", purpose: "workload" } }, actor)).rejects.toThrow("audit unavailable");
      expect(await getDb()`SELECT id FROM apps WHERE name = 'Audit failure'`).toHaveLength(0);
      expect((await listClientSecrets(f.app.id, f.client.id)).ok).toBe(true);
      const rows = await getDb()`SELECT * FROM client_secrets WHERE client_id = ${f.client.id}`;
      expect(rows).toHaveLength(1); expect(rows[0].revoked_at).toBeNull();
      for (const action of ["client.created", "app.created"]) {
        await getDb().unsafe(`CREATE OR REPLACE FUNCTION reject_secret_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = '${action}' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$`);
        await expect(createApp({ name: "Audit failure", initialClient: { label: "Worker", clientType: "confidential", purpose: "workload" } }, actor)).rejects.toThrow("audit unavailable");
        expect(await getDb()`SELECT id FROM apps WHERE name = 'Audit failure'`).toHaveLength(0);
      }
    } finally { await getDb().unsafe("DROP TRIGGER reject_secret_audit ON audit_events; DROP FUNCTION reject_secret_audit()"); }
  });
  test("Code and Refresh flows accept overlapping secrets; denial does not consume the grant", async () => {
    const f = await fixture("interactive"); const added = await (await api("POST", f.path, {})).json();
    const [user] = await getDb()`INSERT INTO app_users(app_id, email, name) VALUES (${f.app.id}, ${`${crypto.randomUUID()}@example.com`}, 'Human') RETURNING id`;
    const code = await issueAuthorizationCode({ appId: f.app.id, appUserId: user.id, appCredentialId: f.client.id, redirectUri: redirect, scope: "openid", resource: f.resource, codeChallenge: null, codeChallengeMethod: null, nonce: null });
    const post = (secret: string, body: Record<string, string>) => dispatchWeb(new Request("http://localhost/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: f.client.clientId, client_secret: secret, ...body }) }));
    const grant = { grant_type: "authorization_code", code, redirect_uri: redirect };
    expect((await post("bad", grant)).status).toBe(401);
    const success = await post(f.clientSecret, grant); expect(success.status).toBe(200); const tokens = await success.json();
    await api("POST", `${f.path}/${f.secret.id}/revoke`, { reason: "ordinary" });
    expect((await post(f.clientSecret, { grant_type: "refresh_token", refresh_token: tokens.refresh_token })).status).toBe(401);
    const refreshed = await post(added.clientSecret, { grant_type: "refresh_token", refresh_token: tokens.refresh_token });
    expect(refreshed.status).toBe(200); expect((await refreshed.json()).refresh_token).toBeString();
  });
  test("revocation after successful authentication is rechecked before workload, Code and Refresh issuance", async () => {
    const worker = await fixture();
    const workerClient = (await findActiveOAuthClient(worker.client.clientId))!;
    expect(await verifyOAuthClientSecret(workerClient, worker.clientSecret)).toBe(true);
    await api("POST", `${worker.path}/${worker.secret.id}/revoke`, { reason: "compromised" });
    expect(await issueClientCredentialsToken({ client: workerClient, scope: "", resource: worker.resource })).toEqual({ ok: false, error: "invalid_client" });
    const f = await fixture("interactive");
    const [user] = await getDb()`INSERT INTO app_users(app_id, email, name) VALUES (${f.app.id}, ${`${crypto.randomUUID()}@example.com`}, 'Human') RETURNING id`;
    const client = (await findActiveOAuthClient(f.client.clientId))!;
    const code = await issueAuthorizationCode({ appId: f.app.id, appUserId: user.id, appCredentialId: f.client.id, redirectUri: redirect, scope: "openid", resource: f.resource, codeChallenge: null, codeChallengeMethod: null, nonce: null });
    expect(await verifyOAuthClientSecret(client, f.clientSecret)).toBe(true);
    const exchanged = await exchangeAuthorizationCode({ client, code, redirectUri: redirect });
    if (!exchanged.ok || !exchanged.refreshToken) throw new Error("fixture exchange");
    const unusedCode = await issueAuthorizationCode({ appId: f.app.id, appUserId: user.id, appCredentialId: f.client.id, redirectUri: redirect, scope: "openid", resource: f.resource, codeChallenge: null, codeChallengeMethod: null, nonce: null });
    await api("POST", `${f.path}/${f.secret.id}/revoke`, { reason: "compromised" });
    expect(await exchangeAuthorizationCode({ client, code: unusedCode, redirectUri: redirect })).toEqual({ ok: false, error: "invalid_client" });
    expect(await exchangeRefreshToken({ client, refreshToken: exchanged.refreshToken })).toEqual({ ok: false, error: "invalid_client" });
    expect((await getDb()`SELECT used_at FROM oauth_authorization_codes WHERE app_id = ${f.app.id} AND used_at IS NULL`)).toHaveLength(1);
    expect((await getDb()`SELECT revoked_at FROM oauth_refresh_tokens WHERE app_id = ${f.app.id}`)[0].revoked_at).toBeNull();
  });
  test("expiry after authentication is rechecked against wall time at issuance", async () => {
    const f = await fixture(); const client = (await findActiveOAuthClient(f.client.clientId))!;
    expect(await verifyOAuthClientSecret(client, f.clientSecret)).toBe(true);
    await getDb()`UPDATE client_secrets SET expires_at = clock_timestamp() - INTERVAL '1 second' WHERE id = ${f.secret.id}`;
    expect(await issueClientCredentialsToken({ client, scope: "", resource: f.resource })).toEqual({ ok: false, error: "invalid_client" });
    expect(await getDb()`SELECT id FROM oauth_grants WHERE client_id = ${f.client.id}`).toHaveLength(0);
  });
  test("conflicting, repeated and malformed client authentication is rejected", async () => {
    const f = await fixture();
    expect((await token(f, f.clientSecret, true, { client_secret: f.clientSecret })).status).toBe(400);
    const repeated = new URLSearchParams({ grant_type: "client_credentials", client_id: f.client.clientId, client_secret: f.clientSecret, resource: f.resource });
    repeated.append("client_secret", "bad");
    expect((await dispatchWeb(new Request("http://localhost/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: repeated }))).status).toBe(400);
    for (const header of ["Basic !!!", "Basic YQ==", "Basic Og==", "Bearer bad", `Basic ${Buffer.from(`${f.client.clientId}:%ZZ`).toString("base64")}`]) {
      const response = await dispatchWeb(new Request("http://localhost/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: header }, body: new URLSearchParams({ grant_type: "client_credentials", resource: f.resource }) }));
      expect(response.status).toBe(401);
    }
    resetRateLimitsForTests();
  });
});
