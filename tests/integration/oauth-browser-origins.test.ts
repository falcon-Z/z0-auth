import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { BunRequest } from "bun";
import { passwordResetWebRoutes } from "../../src/web/auth/password-reset-routes";
import type { CreateAppResponse, CreateClientRequest } from "@z0/contracts/apps";
import { createApp, patchApp } from "../../src/api/lib/apps";
import { createClient, patchClient } from "../../src/api/lib/oauth-clients";
import { createSession, SESSION_COOKIE } from "../../src/api/lib/session";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import { issueAuthorizationCode } from "../../src/api/lib/oauth";
import { sha256Hex } from "../../src/api/lib/crypto";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { makeStrongPassword } from "../helpers/password";
import { testResourceForClient } from "../helpers/resources";
import { dispatchApi } from "./api-routes";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;
const ORIGIN_A = "https://spa-a.example.com";
const ORIGIN_B = "https://spa-b.example.com";
const REDIRECT = "https://callback.example.com/callback";
const config: CreateClientRequest = {
  label: "SPA", clientType: "public", purpose: "interactive", redirectUris: [REDIRECT],
  browserOrigins: [ORIGIN_A], refreshEnabled: true,
};
run("Explicit client browser origins (APP-20, UX-05)", () => {
  let csrf: string, cookie: string;
  let a: CreateAppResponse, b: CreateAppResponse;
  beforeAll(async () => {
    await resetTestDatabase();
    csrf = await fetchCsrfToken(dispatchApi);
    const password = makeStrongPassword();
    expect((await dispatchApi(buildRequest("POST", "/api/setup", { csrfToken: csrf, body: {
      name: "Owner", email: "owner@example.com", password, passwordConfirm: password, organizationName: "Test",
    } }))).status).toBe(201);
    const [owner] = await getDb()`SELECT user_id FROM instance_members WHERE is_bootstrap`;
    cookie = (await createSession(String(owner.user_id), buildRequest("GET", "/"))).token;
    a = await app("A", [ORIGIN_A]);
    b = await app("B", [ORIGIN_B]);
  });
  afterAll(closeDatabase);
  async function app(name: string, browserOrigins: string[]) {
    const result = await createApp({ name, initialClient: { ...config, browserOrigins } });
    if (!result.ok) throw new Error(await result.response.text());
    return result.data;
  }
  function api(method: string, path: string, body?: unknown) {
    return dispatchApi(buildRequest(method, path, { csrfToken: csrf, cookies: { [SESSION_COOKIE]: cookie }, body }));
  }
  function preflight(clientId: string | null, origin: string | null, method = "POST", headers = "content-type, idempotency-key", path = "/oauth/token") {
    const reqHeaders = new Headers({ "Access-Control-Request-Method": method });
    if (origin !== null) reqHeaders.set("Origin", origin);
    if (headers !== "") reqHeaders.set("Access-Control-Request-Headers", headers);
    const query = clientId === null ? "" : `?client_id=${encodeURIComponent(clientId)}`;
    return dispatchWeb(new Request(`http://localhost${path}${query}`, { method: "OPTIONS", headers: reqHeaders }));
  }
  function token(clientId: string, origin: string | null, extra: Record<string, string> = {}, query = "") {
    const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded" });
    if (origin !== null) headers.set("Origin", origin);
    return dispatchWeb(new Request(`http://localhost/oauth/token${query}`, {
      method: "POST", headers, body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, ...extra }),
    }));
  }
  async function code(app: CreateAppResponse) {
    const [user] = await getDb()`INSERT INTO app_users (app_id, email, name)
      VALUES (${app.app.id}, ${`${crypto.randomUUID()}@example.com`}, 'Person') RETURNING id`;
    const verifier = "v".repeat(43);
    const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
    const value = await issueAuthorizationCode({ appId: app.app.id, appUserId: String(user.id), appCredentialId: app.client.id,
      redirectUri: REDIRECT, scope: "openid profile", resource: await testResourceForClient(app.client.id),
      codeChallenge: challenge, codeChallengeMethod: "S256", nonce: null });
    return { code: value, code_verifier: verifier, redirect_uri: REDIRECT };
  }
  test("preflight checks the addressed Client's own exact origin and endpoint method/headers", async () => {
    const allowed = await preflight(a.client.clientId, ORIGIN_A);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN_A);
    expect(allowed.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(allowed.headers.get("Access-Control-Allow-Headers")).toContain("Idempotency-Key");
    expect(allowed.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(allowed.headers.get("Cache-Control")).toBe("no-store");
    const cases: Array<[string | null, string | null, string?, string?]> = [
      [b.client.clientId, ORIGIN_A], [a.client.clientId, ORIGIN_B], [a.client.clientId, new URL(REDIRECT).origin],
      [null, ORIGIN_A], ["unknown", ORIGIN_A], [a.client.clientId, null],
      [a.client.clientId, ORIGIN_A, "DELETE"], [a.client.clientId, ORIGIN_A, "POST", "Authorization"],
      [a.client.clientId, ORIGIN_A, "POST", "X-Unregistered"],
    ];
    for (const args of cases) {
      const denied = await preflight(...args);
      expect(denied.status).toBe(403);
      expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
    expect((await preflight(a.client.clientId, ORIGIN_A, "GET", "Authorization", "/oauth/userinfo")).status).toBe(204);
    expect((await preflight(a.client.clientId, ORIGIN_A, "POST", "content-type", "/oauth/userinfo")).status).toBe(403);
    const repeated = await dispatchWeb(new Request(`http://localhost/oauth/token?client_id=${a.client.clientId}&client_id=${a.client.clientId}`, {
      method: "OPTIONS", headers: { Origin: ORIGIN_A, "Access-Control-Request-Method": "POST" },
    }));
    expect(repeated.status).toBe(403);
  });
  test("redirects never grant CORS; same-origin and no-Origin requests retain their protocol behavior", async () => {
    const redirectOnly = await app("Redirect only", []);
    expect((await preflight(redirectOnly.client.clientId, new URL(REDIRECT).origin)).status).toBe(403);
    expect((await token(redirectOnly.client.clientId, new URL(REDIRECT).origin)).status).toBe(403);
    for (const origin of ["http://localhost", null]) {
      const response = await token(redirectOnly.client.clientId, origin);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("invalid_request");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });
  test("cross-client and malformed token requests fail before consuming an authorization code", async () => {
    const params = await code(b);
    const denied = await token(b.client.clientId, ORIGIN_A, params);
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
    for (const origin of ["null", "https://spa-b.example.com/path", "https://spa-b.example.com/", "https://*.example.com", "https://spa-b.example.com?x", "https://spa-b.example.com https://spa-a.example.com"]) {
      expect((await token(b.client.clientId, origin, params)).status).toBe(403);
      expect((await preflight(b.client.clientId, origin)).status).toBe(403);
    }
    const [pending] = await getDb()`SELECT used_at FROM oauth_authorization_codes WHERE code_hash = ${await sha256Hex(params.code)}`;
    expect(pending.used_at).toBeNull();
    const accepted = await token(b.client.clientId, ORIGIN_B, params);
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN_B);
  });
  test("URL/body client substitution and repeated client IDs cannot bypass client binding", async () => {
    const params = await code(b);
    const conflict = await token(b.client.clientId, ORIGIN_A, params, `?client_id=${a.client.clientId}`);
    expect(conflict.status).toBe(400);
    expect((await conflict.json()).error).toBe("invalid_request");
    expect(conflict.headers.get("Access-Control-Allow-Origin")).toBeNull();
    for (const query of [`?client_id=${b.client.clientId}&client_id=${b.client.clientId}`, "?client_id="]) {
      expect((await token(b.client.clientId, ORIGIN_B, params, query)).status).toBe(400);
    }
    const body = new URLSearchParams({ grant_type: "authorization_code", client_id: b.client.clientId, ...params });
    body.append("client_id", a.client.clientId);
    expect((await dispatchWeb(new Request("http://localhost/oauth/token", {
      method: "POST", headers: { Origin: ORIGIN_B, "Content-Type": "application/x-www-form-urlencoded" }, body,
    }))).status).toBe(400);
    expect((await token(b.client.clientId, null, params)).status).toBe(200);
  });
  test("refresh denial leaves the token usable; UserInfo checks the bearer token's Client", async () => {
    const grant = await token(a.client.clientId, ORIGIN_A, await code(a));
    const tokens = await grant.json();
    expect(grant.status).toBe(200);
    const refresh = { grant_type: "refresh_token", refresh_token: tokens.refresh_token };
    expect((await token(a.client.clientId, ORIGIN_B, refresh)).status).toBe(403);
    expect((await token(a.client.clientId, ORIGIN_A, refresh)).status).toBe(200);
    // Rotation does not revoke the preceding access token during its ordinary lifetime.
    async function userinfo(origin: string | null, query = "", bearer = tokens.access_token) {
      const headers = new Headers({ Authorization: `Bearer ${bearer}` });
      if (origin !== null) headers.set("Origin", origin);
      return dispatchWeb(new Request(`http://localhost/oauth/userinfo${query}`, { headers }));
    }
    expect((await userinfo(ORIGIN_B)).status).toBe(403);
    expect((await userinfo(ORIGIN_A, `?client_id=${b.client.clientId}`)).status).toBe(400);
    const accepted = await userinfo(ORIGIN_A, `?client_id=${a.client.clientId}`);
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN_A);
    expect((await accepted.json()).sub).toBeTruthy();
    expect((await userinfo(null)).status).toBe(200);
    expect((await userinfo("http://localhost")).status).toBe(200);
    const invalid = await userinfo(ORIGIN_B, "", "invalid");
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
  test("API origin registration independently validates, adds and removes client authority", async () => {
    const managed = await app("Managed", []);
    const path = `/api/v1/apps/${managed.app.id}/clients/${managed.client.id}`;
    for (const browserOrigins of [["https://app.example.com/path"], ["https://app.example.com?query"], ["https://app.example.com#fragment"],
      ["https://user@app.example.com"], ["https://*.example.com"], ["http://192.168.1.1"], ["http://staging.example.com"],
      ["https://app.example.com:443"], ["https://APP.example.com"], ["null"], ["file:///tmp"], [123], "https://app.example.com", Array(21).fill(ORIGIN_A)]) {
      expect((await api("PATCH", path, { browserOrigins })).status).toBe(400);
    }
    const invalidCreate = await api("POST", `/api/v1/apps/${managed.app.id}/clients`, { ...config, browserOrigins: ["https://app.example.com/path"] });
    expect(invalidCreate.status).toBe(400);
    const registered = await api("PATCH", path, { browserOrigins: [ORIGIN_A, ORIGIN_A, "http://127.0.0.1:5173", "http://[::1]:5173"] });
    expect(registered.status).toBe(200);
    const result = await registered.json();
    expect(result.browserOrigins).toEqual([ORIGIN_A, "http://127.0.0.1:5173", "http://[::1]:5173"]);
    expect(result.redirectUris).toEqual([REDIRECT]);
    expect((await preflight(managed.client.clientId, ORIGIN_A)).status).toBe(204);
    expect((await api("PATCH", path, { browserOrigins: [] })).status).toBe(200);
    expect((await preflight(managed.client.clientId, ORIGIN_A)).status).toBe(403);
    expect((await token(managed.client.clientId, ORIGIN_A)).status).toBe(403);
    const read = await api("GET", `/api/v1/apps/${managed.app.id}/clients`);
    expect((await read.json()).clients[0].browserOrigins).toEqual([]);
    for (const kind of ["confidential", "workload"] as const) {
      const invalid = await createClient(managed.app.id, { ...config, clientType: "confidential", purpose: kind === "workload" ? "workload" : "interactive", redirectUris: kind === "workload" ? [] : [REDIRECT], refreshEnabled: false });
      expect(invalid.ok).toBe(false);
    }
  });
  test("disabled Clients and Applications immediately lose preflight authority", async () => {
    const managed = await app("Containment", [ORIGIN_A]);
    expect((await preflight(managed.client.clientId, ORIGIN_A)).status).toBe(204);
    expect((await patchClient(managed.app.id, managed.client.id, { status: "disabled" })).ok).toBe(true);
    expect((await preflight(managed.client.clientId, ORIGIN_A)).status).toBe(403);
    expect((await patchClient(managed.app.id, managed.client.id, { status: "active" })).ok).toBe(true);
    expect((await patchApp(managed.app.id, { status: "disabled" })).ok).toBe(true);
    expect((await preflight(managed.client.clientId, ORIGIN_A)).status).toBe(403);
  });
  test("login, authorization and recovery remain navigation surfaces without browser CORS", async () => {
    for (const path of ["/oauth/authorize", "/auth/login", "/auth/mfa", "/oauth/resume"]) {
      for (const method of ["GET", "OPTIONS"]) {
        const response = await dispatchWeb(new Request(`http://localhost${path}`, {
          method, headers: { Origin: ORIGIN_A, "Access-Control-Request-Method": "GET" },
        }));
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
        expect(response.status).not.toBe(404);
      }
    }
    // The shared dispatcher omits password-reset routes; exercise the real handler.
    const recovery = await passwordResetWebRoutes["/auth/forgot-password"].GET(
      new Request("http://localhost/auth/forgot-password", { headers: { Origin: ORIGIN_A } }) as BunRequest,
    );
    expect(recovery.status).not.toBe(404);
    expect(recovery.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect("OPTIONS" in passwordResetWebRoutes["/auth/forgot-password"]).toBe(false);
  });
});
