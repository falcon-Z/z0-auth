import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import { createPgSql } from "../../src/api/lib/create-pg-sql";
import { createApp, patchApp } from "../../src/api/lib/apps";
import { createClient, patchClient } from "../../src/api/lib/oauth-clients";
import {
  createScopeForApi,
  patchScopeForApi,
  deleteScopeForApi,
} from "../../src/api/lib/app-scopes";
import {
  createResource,
  patchResource,
  putClientResource,
} from "../../src/api/lib/oauth-resources";
import {
  findActiveOAuthClient,
  issueAuthorizationCode,
  findOAuthAccessToken,
  revokeAllOAuthTokensForAppUser,
} from "../../src/api/lib/oauth";
import { createSession, SESSION_COOKIE } from "../../src/api/lib/session";
import { hashPassword } from "../../src/api/lib/password";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import {
  approveOAuthConsent,
  loginApplicationIdentity,
} from "../helpers/oauth";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;
const redirect = "http://localhost:3000/callback";
const password = makeStrongPassword();
async function fixture() {
  const result = await createApp({
    name: "Resource test",
    initialClient: {
      label: "Server",
      clientType: "confidential",
      purpose: "interactive",
      redirectUris: [redirect],
      refreshEnabled: true,
    },
  });
  if (!result.ok) throw new Error(await result.response.text());
  const appId = result.data.app.id;
  for (const name of ["read", "write"]) {
    const s = await createScopeForApi(appId, { name });
    if (!s.ok) throw new Error(await s.response.text());
  }
  const a = await createResource(appId, {
    name: "Orders",
    audience: `https://api.example.com/orders/${appId}`,
    scopes: ["openid", "read", "write"],
  });
  const b = await createResource(appId, {
    name: "Billing",
    audience: `https://api.example.com/billing/${appId}`,
    scopes: ["read"],
  });
  if (!a.ok || !b.ok) throw new Error("Failed resource setup");
  const workload = await createClient(appId, {
    label: "Worker",
    clientType: "confidential",
    purpose: "workload",
  });
  if (!workload.ok) throw new Error("Failed workload setup");
  const [user] =
    await getDb()`INSERT INTO app_users(app_id, name, email, password_hash) VALUES (${appId}, 'Person', ${`${appId}@example.com`}, ${await hashPassword(password)}) RETURNING id`;
  return {
    appId,
    client: result.data.client,
    secret: result.data.clientSecret!,
    workload: workload.data.client,
    workloadSecret: workload.data.clientSecret!,
    subjectId: String(user.id),
    a: a.resource,
    b: b.resource,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function permit(f: Fixture, scopes = ["openid", "read", "write"]) {
  expect(
    (await putClientResource(f.appId, f.client.id, f.a.id, scopes)).ok,
  ).toBe(true);
}
async function code(f: Fixture, scope = "read", resource = f.a.audience) {
  return issueAuthorizationCode({
    appId: f.appId,
    appUserId: f.subjectId,
    appCredentialId: f.client.id,
    redirectUri: redirect,
    scope,
    resource,
    codeChallenge: null,
    codeChallengeMethod: null,
    nonce: null,
  });
}
async function token(
  f: Fixture,
  params: Record<string, string> | URLSearchParams,
  worker = false,
) {
  const body = new URLSearchParams(params);
  body.set("client_id", worker ? f.workload.clientId : f.client.clientId);
  body.set("client_secret", worker ? f.workloadSecret : f.secret);
  return dispatchWeb(
    new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
}
async function exchange(f: Fixture, scope = "read") {
  const res = await token(f, {
    grant_type: "authorization_code",
    code: await code(f, scope),
    redirect_uri: redirect,
  });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    scope: string;
  };
}
run("Registered Resources and grant authority", () => {
  let auth: { csrf: string; cookie: string };
  beforeAll(async () => {
    await resetTestDatabase();
    const csrf = await fetchCsrfToken(dispatchApi);
    const setup = await dispatchApi(
      buildRequest("POST", "/api/setup", {
        csrfToken: csrf,
        body: {
          name: "Owner",
          email: "resource-owner@example.com",
          password,
          passwordConfirm: password,
          organizationName: "Resources",
        },
      }),
    );
    expect(setup.status).toBe(201);
    const login = await dispatchApi(
      buildRequest("POST", "/api/auth/login", {
        csrfToken: csrf,
        body: { email: "resource-owner@example.com", password },
      }),
    );
    const raw = login.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    auth = {
      csrf,
      cookie: decodeURIComponent(
        raw.split(";")[0]!.slice(SESSION_COOKIE.length + 1),
      ),
    };
  });
  afterAll(closeDatabase);
  const api = (method: string, path: string, body?: unknown) =>
    dispatchApi(
      buildRequest(method, path, {
        csrfToken: auth.csrf,
        cookies: { [SESSION_COOKIE]: auth.cookie },
        body,
      }),
    );

  test("operator CRUD validates vocabulary, keeps audience immutable and reserves retired audiences", async () => {
    const f = await fixture();
    const path = `/api/v1/apps/${f.appId}/resources`;
    expect(
      (
        await api("POST", path, {
          name: "Invalid",
          audience: "relative",
          scopes: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api("POST", path, {
          name: "Invalid",
          audience: "https://example.com/#",
          scopes: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api("POST", path, {
          name: "Invalid",
          audience: "urn:test:unknown",
          scopes: ["unknown"],
        })
      ).status,
    ).toBe(400);
    const created = await api("POST", path, {
      name: "Inventory",
      audience: `urn:inventory:${f.appId}`,
      scopes: ["read"],
    });
    expect(created.status).toBe(201);
    const r = await created.json();
    expect(
      (await api("PATCH", `${path}/${r.id}`, { audience: "urn:changed" }))
        .status,
    ).toBe(400);
    expect(
      (await api("PATCH", `${path}/${r.id}`, { name: "New name" })).status,
    ).toBe(200);
    const listed = await (await api("GET", path)).json();
    expect(listed.resources.find((v: any) => v.id === r.id).audience).toBe(
      r.audience,
    );
    expect((await api("DELETE", `${path}/${r.id}`)).status).toBe(200);
    expect(
      (await api("PATCH", `${path}/${r.id}`, { name: "Restore" })).status,
    ).toBe(409);
    expect(
      (
        await api("POST", path, {
          name: "Reuse",
          audience: r.audience,
          scopes: [],
        })
      ).status,
    ).toBe(409);
    await expect(
      (async () =>
        await getDb()`DELETE FROM oauth_resources WHERE id = ${r.id}`)(),
    ).rejects.toThrow();
  });
  test("management requires operator permissions, CSRF and current verification", async () => {
    const f = await fixture(),
      path = `/api/v1/apps/${f.appId}/resources`;
    expect((await dispatchApi(buildRequest("GET", path))).status).toBe(401);
    expect(
      (
        await dispatchApi(
          buildRequest("POST", path, {
            cookies: { [SESSION_COOKIE]: auth.cookie },
            body: {},
          }),
        )
      ).status,
    ).toBe(403);
    const [viewer] =
      await getDb()`INSERT INTO users(name,email) VALUES ('Viewer', 'resources-viewer@example.com') RETURNING id`;
    await getDb()`INSERT INTO instance_members(user_id) VALUES (${viewer.id})`;
    const session = await createSession(
      String(viewer.id),
      buildRequest("GET", path),
    );
    const cookie = session.token;
    expect(
      (
        await dispatchApi(
          buildRequest("GET", path, { cookies: { [SESSION_COOKIE]: cookie } }),
        )
      ).status,
    ).toBe(403);
    const [role] =
      await getDb()`INSERT INTO instance_roles(key, name) VALUES ('resource-manager', 'Resource manager') RETURNING id`;
    await getDb()`INSERT INTO instance_role_scopes(role_id, scope_key) VALUES (${role.id}, 'apps.resources:read'), (${role.id}, 'apps.resources:manage')`;
    await getDb()`INSERT INTO instance_member_roles(member_user_id, role_id) VALUES (${viewer.id}, ${role.id})`;
    expect(
      (
        await dispatchApi(
          buildRequest("GET", path, { cookies: { [SESSION_COOKIE]: cookie } }),
        )
      ).status,
    ).toBe(200);
    await getDb()`UPDATE sessions SET primary_authenticated_at = NOW() - INTERVAL '15 minutes' WHERE user_id = ${viewer.id}`;
    const stale = await dispatchApi(
      buildRequest("POST", path, {
        csrfToken: auth.csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "Stale", audience: "urn:stale:api", scopes: [] },
      }),
    );
    expect(stale.status).toBe(403);
  });
  test("new clients have no implicit Resource authority; permission APIs enforce resource vocabulary", async () => {
    const f = await fixture(),
      path = `/api/v1/apps/${f.appId}/clients/${f.client.id}/resources`;
    expect((await (await api("GET", path)).json()).permissions).toEqual([]);
    expect(
      (await api("PUT", `${path}/${f.a.id}`, { scopes: ["unknown"] })).status,
    ).toBe(400);
    expect(
      (await api("PUT", `${path}/${f.a.id}`, { scopes: ["read"] })).status,
    ).toBe(200);
    const permissions = (await (await api("GET", path)).json()).permissions;
    expect(permissions[0].scopes).toEqual(["read"]);
    expect((await api("DELETE", `${path}/${f.a.id}`)).status).toBe(200);
  });
  test("Client Credentials rejects missing, malformed, repeated, unknown and unauthorized resource indicators", async () => {
    const f = await fixture();
    for (const resource of [
      undefined,
      "relative",
      "https://api.example.com/#fragment",
      "urn:unknown",
      f.a.audience,
    ]) {
      const res = await token(
        f,
        {
          grant_type: "client_credentials",
          ...(resource === undefined ? {} : { resource }),
        },
        true,
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_target");
    }
    await putClientResource(f.appId, f.workload.id, f.a.id, ["read"]);
    const repeated = new URLSearchParams({
      grant_type: "client_credentials",
      resource: f.a.audience,
    });
    repeated.append("resource", f.a.audience);
    expect((await (await token(f, repeated, true)).json()).error).toBe(
      "invalid_target",
    );
    expect(
      (
        await (
          await token(
            f,
            {
              grant_type: "client_credentials",
              resource: f.a.audience,
              scope: "write",
            },
            true,
          )
        ).json()
      ).error,
    ).toBe("invalid_scope");
  });
  test("authorization rejects unknown/unauthorized targets and out-of-ceiling scopes before login", async () => {
    const f = await fixture();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: f.client.clientId,
      redirect_uri: redirect,
      state: "test",
      scope: "read",
    });
    const authorize = () =>
      dispatchWeb(new Request(`http://localhost/oauth/authorize?${params}`));
    expect(
      new URL((await authorize()).headers.get("location")!).searchParams.get(
        "error",
      ),
    ).toBe("invalid_target");
    params.set("resource", "urn:unknown");
    expect(
      new URL((await authorize()).headers.get("location")!).searchParams.get(
        "error",
      ),
    ).toBe("invalid_target");
    params.set("resource", f.a.audience);
    expect(
      new URL((await authorize()).headers.get("location")!).searchParams.get(
        "error",
      ),
    ).toBe("invalid_target");
    await permit(f, ["read"]);
    params.set("scope", "write");
    expect(
      new URL((await authorize()).headers.get("location")!).searchParams.get(
        "error",
      ),
    ).toBe("invalid_scope");
    params.set("scope", "read");
    params.append("resource", f.b.audience);
    expect(
      new URL((await authorize()).headers.get("location")!).searchParams.get(
        "error",
      ),
    ).toBe("invalid_target");
  });
  test("hosted authorization freezes the reviewed Resource and rejects substitution", async () => {
    const f = await fixture();
    await permit(f, ["openid", "read"]);
    const session = await loginApplicationIdentity(dispatchWeb, {
      clientId: f.client.clientId,
      email: `${f.appId}@example.com`,
      password,
    });
    const c = await approveOAuthConsent(dispatchWeb, {
      clientId: f.client.clientId,
      redirectUri: redirect,
      scope: "openid read",
      state: "resource-test",
      appSession: session,
      resource: f.a.audience,
    });
    const res = await token(f, {
      grant_type: "authorization_code",
      code: c,
      redirect_uri: redirect,
      resource: f.b.audience,
    });
    expect(res.status).toBe(400);
    const valid = await token(f, {
      grant_type: "authorization_code",
      code: c,
      redirect_uri: redirect,
      resource: f.a.audience,
    });
    expect(valid.status).toBe(200);
    expect(
      (await findOAuthAccessToken((await valid.json()).access_token))?.audience,
    ).toBe(f.a.audience);
  });
  test("human and workload tokens expose exactly one audience; Resource A is not authority for B", async () => {
    const f = await fixture();
    await permit(f, ["read"]);
    await putClientResource(f.appId, f.client.id, f.b.id, ["read"]);
    await putClientResource(f.appId, f.workload.id, f.a.id, ["read"]);
    const human = await exchange(f),
      machine = await token(
        f,
        {
          grant_type: "client_credentials",
          resource: f.a.audience,
          scope: "read",
        },
        true,
      );
    expect(machine.status).toBe(200);
    const workload = await machine.json();
    expect(workload.refresh_token).toBeUndefined();
    for (const [access, client, secret] of [
      [human.access_token, f.client.clientId, f.secret],
      [workload.access_token, f.workload.clientId, f.workloadSecret],
    ]) {
      const res = await dispatchWeb(
        new Request("http://localhost/oauth/introspect", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: client!,
            client_secret: secret!,
            token: access!,
          }),
        }),
      );
      const info = await res.json();
      expect(info.active).toBe(true);
      expect(info.aud).toBe(f.a.audience);
      expect(info.aud === f.b.audience).toBe(false);
      expect(info.scope).toBe("read");
    }
    expect((await findOAuthAccessToken(human.access_token))?.grantId).not.toBe(
      (await findOAuthAccessToken(workload.access_token))?.grantId,
    );
  });
  test("independent grants do not merge scopes and refresh cannot switch resources", async () => {
    const f = await fixture();
    await permit(f);
    await putClientResource(f.appId, f.client.id, f.b.id, ["read"]);
    const read = await exchange(f, "read"),
      write = await exchange(f, "write");
    const denied = await token(f, {
      grant_type: "refresh_token",
      refresh_token: read.refresh_token,
      resource: f.b.audience,
    });
    expect(denied.status).toBe(400);
    const renewed = await token(f, {
      grant_type: "refresh_token",
      refresh_token: read.refresh_token,
    });
    expect(renewed.status).toBe(200);
    expect((await renewed.json()).scope).toBe("read");
    expect((await findOAuthAccessToken(write.access_token))?.scope).toBe(
      "write",
    );
    expect((await findOAuthAccessToken(read.access_token))?.grantId).not.toBe(
      (await findOAuthAccessToken(write.access_token))?.grantId,
    );
    const grants =
      await getDb()`SELECT scope FROM oauth_grants WHERE client_id = ${f.client.id}`;
    expect(grants.map((g: { scope: string }) => g.scope).sort()).toEqual([
      "read",
      "write",
    ]);
  });
  test("scope reduction contracts renewable grants permanently, even if restored before refresh", async () => {
    const f = await fixture();
    await permit(f);
    const first = await exchange(f, "read write");
    await putClientResource(f.appId, f.client.id, f.a.id, ["read"]);
    await permit(f);
    const res = await token(f, {
      grant_type: "refresh_token",
      refresh_token: first.refresh_token,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).scope).toBe("read");
    const fresh = await exchange(f, "write");
    expect(fresh.scope).toBe("write");
    const [grant] =
      await getDb()`SELECT grant_id FROM oauth_refresh_tokens WHERE app_credential_id = ${f.client.id} LIMIT 1`;
    await expect(
      (async () =>
        await getDb()`UPDATE oauth_grants SET scope = 'read write' WHERE id = ${grant.grant_id}`)(),
    ).rejects.toThrow();
  });
  test("refresh scope requests can narrow access tokens but cannot borrow authority from another grant", async () => {
    const f = await fixture();
    await permit(f);
    const read = await exchange(f, "read"),
      broad = await exchange(f, "read write");
    const escalation = await token(f, {
      grant_type: "refresh_token",
      refresh_token: read.refresh_token,
      scope: "write",
    });
    expect(escalation.status).toBe(400);
    expect((await escalation.json()).error).toBe("invalid_scope");
    const narrowed = await token(f, {
      grant_type: "refresh_token",
      refresh_token: broad.refresh_token,
      scope: "read",
    });
    expect(narrowed.status).toBe(200);
    const narrow = await narrowed.json();
    expect(narrow.scope).toBe("read");
    expect((await findOAuthAccessToken(narrow.access_token))?.scope).toBe(
      "read",
    );
    const continued = await token(f, {
      grant_type: "refresh_token",
      refresh_token: narrow.refresh_token,
    });
    expect(continued.status).toBe(200);
    expect((await continued.json()).scope).toBe("read write");
    expect(
      (
        await token(f, {
          grant_type: "refresh_token",
          refresh_token: read.refresh_token,
        })
      ).status,
    ).toBe(200);
  });
  test("encrypted refresh retries cannot return a different request's scope or revive removed scopes", async () => {
    const f = await fixture();
    await permit(f);
    const first = await exchange(f, "read write");
    const retryKey = "resource-retry-bound-scope-0001";
    const refresh = (scope: string) =>
      dispatchWeb(
        new Request("http://localhost/oauth/token", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "idempotency-key": retryKey,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: f.client.clientId,
            client_secret: f.secret,
            refresh_token: first.refresh_token,
            scope,
          }),
        }),
      );
    const one = await refresh("read");
    expect(one.status).toBe(200);
    const outcome = await one.json();
    const retry = await refresh("read");
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(outcome);
    expect((await refresh("write")).status).toBe(400);
    const newGrant = await exchange(f, "read write");
    const rotation = await dispatchWeb(
      new Request("http://localhost/oauth/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "idempotency-key": retryKey,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: f.client.clientId,
          client_secret: f.secret,
          refresh_token: newGrant.refresh_token,
        }),
      }),
    );
    expect(rotation.status).toBe(200);
    const child = await rotation.json();
    await putClientResource(f.appId, f.client.id, f.a.id, ["read"]);
    const renewed = await token(f, {
      grant_type: "refresh_token",
      refresh_token: child.refresh_token,
    });
    expect(renewed.status).toBe(200);
    expect((await renewed.json()).scope).toBe("read");
    const retryState =
      await getDb()`SELECT retry_response_ciphertext FROM oauth_refresh_tokens WHERE app_credential_id = ${f.client.id} AND scope = 'read write'`;
    expect(
      retryState.every(
        (r: { retry_response_ciphertext: string | null }) =>
          r.retry_response_ciphertext === null,
      ),
    ).toBe(true);
  });
  test("resource-scope removal and application-scope rename/deletion contract grants", async () => {
    const f = await fixture();
    await permit(f);
    const first = await exchange(f, "read write");
    await patchResource(f.appId, f.a.id, { scopes: ["openid", "read"] });
    const res = await token(f, {
      grant_type: "refresh_token",
      refresh_token: first.refresh_token,
    });
    expect(res.status).toBe(200);
    const renewed = await res.json();
    expect(renewed.scope).toBe("read");
    const [scope] =
      await getDb()`SELECT id FROM app_scopes WHERE app_id = ${f.appId} AND name = 'read'`;
    expect(
      (await patchScopeForApi(f.appId, scope.id, { name: "renamed" })).ok,
    ).toBe(true);
    const r = await token(f, {
      grant_type: "refresh_token",
      refresh_token: renewed.refresh_token,
    });
    expect(r.status).toBe(200);
    expect((await r.json()).scope).toBe("");
    expect((await deleteScopeForApi(f.appId, scope.id)).ok).toBe(true);
  });
  test("removing resource permission revokes only its grants and re-adding cannot resurrect them", async () => {
    const f = await fixture();
    await permit(f);
    await putClientResource(f.appId, f.client.id, f.b.id, ["read"]);
    const a = await exchange(f),
      bResponse = await token(f, {
        grant_type: "authorization_code",
        code: await code(f, "read", f.b.audience),
        redirect_uri: redirect,
      });
    expect(bResponse.status).toBe(200);
    const b = await bResponse.json();
    await putClientResource(f.appId, f.client.id, f.a.id, [], true);
    await permit(f);
    expect(
      (
        await token(f, {
          grant_type: "refresh_token",
          refresh_token: a.refresh_token,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await token(f, {
          grant_type: "refresh_token",
          refresh_token: b.refresh_token,
        })
      ).status,
    ).toBe(200);
  });
  test("code exchange rechecks the current ceiling without consuming or creating escalated authority", async () => {
    const f = await fixture();
    await permit(f);
    const c = await code(f, "write");
    await permit(f, ["read"]);
    expect(
      (
        await token(f, {
          grant_type: "authorization_code",
          code: c,
          redirect_uri: redirect,
        })
      ).status,
    ).toBe(400);
    expect(
      await getDb()`SELECT id FROM oauth_grants WHERE client_id = ${f.client.id}`,
    ).toHaveLength(0);
  });
  test("retirement and cross-application resource-owner disablement invalidate future issuance", async () => {
    const f = await fixture(),
      owner = await fixture();
    await putClientResource(f.appId, f.client.id, owner.a.id, ["read"]);
    const c = await code(f, "read", owner.a.audience);
    const first = await token(f, {
      grant_type: "authorization_code",
      code: c,
      redirect_uri: redirect,
    });
    expect(first.status).toBe(200);
    const tokens = await first.json();
    await patchApp(owner.appId, { status: "disabled" });
    await patchApp(owner.appId, { status: "active" });
    expect(
      (
        await token(f, {
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
        })
      ).status,
    ).toBe(400);
    await permit(f);
    const own = await exchange(f);
    await patchResource(f.appId, f.a.id, {}, true);
    expect(
      (
        await token(f, {
          grant_type: "refresh_token",
          refresh_token: own.refresh_token,
        })
      ).status,
    ).toBe(400);
  });
  test("concurrent code exchanges establish one grant only", async () => {
    const f = await fixture();
    await permit(f);
    const c = await code(f);
    const responses = await Promise.all([
      token(f, {
        grant_type: "authorization_code",
        code: c,
        redirect_uri: redirect,
      }),
      token(f, {
        grant_type: "authorization_code",
        code: c,
        redirect_uri: redirect,
      }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(
      await getDb()`SELECT id FROM oauth_grants WHERE client_id = ${f.client.id}`,
    ).toHaveLength(1);
  });
  test("Account recovery can revoke a family while a competing refresh waits for identity state", async () => {
    const f = await fixture();
    await permit(f);
    const first = await exchange(f);
    const replica = createPgSql(process.env.DATABASE_URL!);
    let issuance: Promise<Response> | undefined;
    try {
      await replica.begin(async (tx) => {
        const [identity] =
          await tx`SELECT b.id, pg_backend_pid() AS pid FROM app_account_bindings b
          JOIN accounts a ON a.id = b.account_id WHERE b.id = ${f.subjectId} FOR UPDATE OF a, b`;
        issuance = token(f, {
          grant_type: "refresh_token",
          refresh_token: first.refresh_token,
        });
        let waiting = false;
        for (let i = 0; i < 100; i++) {
          const [state] =
            await getDb()`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
            WHERE ${identity.pid}::int = ANY(pg_blocking_pids(pid)) AND query LIKE '%SELECT r.family_id%') AS waiting`;
          if (state.waiting) {
            waiting = true;
            break;
          }
          await Bun.sleep(10);
        }
        expect(waiting).toBe(true);
        await revokeAllOAuthTokensForAppUser(f.subjectId, tx);
      });
      expect((await issuance!).status).toBe(400);
      expect(
        (await findOAuthAccessToken(first.access_token))?.revokedAt,
      ).not.toBeNull();
    } finally {
      if (issuance) await issuance;
      await replica.close();
    }
  });
  test("permission removal serializes with issuance from another database connection", async () => {
    const f = await fixture();
    await permit(f);
    const first = await exchange(f);
    const replica = createPgSql(process.env.DATABASE_URL!);
    let release!: () => void, locked!: () => void;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      ready = new Promise<void>((r) => {
        locked = r;
      });
    const mutation = replica.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext('z0:resource-authority'))`;
      await tx`DELETE FROM client_resource_permissions WHERE client_id = ${f.client.id} AND resource_id = ${f.a.id}`;
      locked();
      await gate;
    });
    try {
      await ready;
      const issuance = token(f, {
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
      });
      for (let i = 0; i < 100; i++) {
        const [row] =
          await getDb()`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory' AND query LIKE '%resource-authority%'`;
        if (row.count > 0) break;
        if (i === 99)
          throw new Error(
            "Issuance did not wait on authoritative policy change",
          );
        await Bun.sleep(10);
      }
      release();
      await mutation;
      expect((await issuance).status).toBe(400);
    } finally {
      release();
      await mutation;
      await replica.close();
    }
  });
});
