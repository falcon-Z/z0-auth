import { testResourceForClient } from "../helpers/resources";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  exchangeAuthorizationCode,
  findActiveOAuthClient,
  isAllowedRedirectUri,
  issueAuthorizationCode,
  verifyOAuthClientSecret,
  exchangeRefreshToken,
  issueClientCredentialsToken,
} from "../../src/api/lib/oauth";
import { isOAuthCorsOriginAllowed } from "../../src/api/lib/oauth-cors";
import { createSession } from "../../src/api/lib/session";
import { dispatchWeb } from "./web-dispatch";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import {
  APP_SESSION_COOKIE,
  createAppSession,
} from "../../src/api/lib/app-session";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";
import { containApplication } from "../../src/api/lib/apps";
import { createPostgresOAuthConsentChallengeAuthority } from "../../src/api/lib/oauth-consent-challenges";
import { createAuthorizationServer } from "../../src/capabilities/authorization-server";

const run = hasTestDatabase() ? describe : describe.skip;

const ownerPassword = makeStrongPassword();
const REDIRECT = "http://localhost:3000/oauth/callback";

function sessionCookieFromResponse(res: Response): string | undefined {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const match = raw?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

async function completeSetup() {
  const csrf = await fetchCsrfToken(dispatchApi);
  await dispatchApi(
    buildRequest("POST", "/api/setup", {
      csrfToken: csrf,
      body: {
        name: "Owner User",
        email: "owner@example.com",
        password: ownerPassword,
        passwordConfirm: ownerPassword,
        organizationName: "Acme Corp",
      },
    }),
  );
}

async function login() {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "owner@example.com", password: ownerPassword },
    }),
  );
  return { csrf, cookie: sessionCookieFromResponse(res)! };
}

run("Applications and child OAuth clients", () => {
  let appId = "";
  let serverId = "";
  let spaId = "";
  let serverClientId = "";
  let serverSecret = "";
  let spaClientId = "";
  let auth: { csrf: string; cookie: string };
  const server = {
    label: "Server web",
    clientType: "confidential",
    purpose: "interactive",
    redirectUris: [REDIRECT],
    refreshEnabled: true,
  };
  const spa = {
    label: "SPA",
    clientType: "public",
    purpose: "interactive",
    redirectUris: ["http://localhost:3001/callback"],
    browserOrigins: ["http://localhost:3001"],
    refreshEnabled: true,
  };
  const request = (
    method: string,
    path: string,
    body?: unknown,
    withCsrf = true,
  ) =>
    dispatchApi(
      buildRequest(method, path, {
        csrfToken: withCsrf ? auth.csrf : undefined,
        cookies: { [SESSION_COOKIE]: auth.cookie },
        body,
      }),
    );
  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
    auth = await login();
  });
  afterAll(closeDatabase);
  test("unauthenticated and missing-CSRF requests cannot manage applications or clients", async () => {
    expect(
      (await dispatchApi(buildRequest("GET", "/api/v1/apps"))).status,
    ).toBe(401);
    expect(
      (
        await request(
          "POST",
          "/api/v1/apps",
          { name: "Product", initialClient: server },
          false,
        )
      ).status,
    ).toBe(403);
  });
  test("one Application holds server-web and SPA clients without protocol fields on the Application", async () => {
    const response = await request("POST", "/api/v1/apps", {
      name: "Product",
      initialClient: server,
    });
    expect(response.status).toBe(201);
    const result = await response.json();
    appId = result.app.id;
    serverId = result.client.id;
    serverClientId = result.client.clientId;
    serverSecret = result.clientSecret;
    expect(result.app.minimumAssurance).toBe("baseline");
    expect(result.app.activeClientCount).toBe(1);
    expect(result.app.clientType).toBeUndefined();
    expect(result.app.redirectUris).toBeUndefined();
    expect(result.client.clientType).toBe("confidential");
    expect(serverSecret.length).toBeGreaterThan(20);
    const created = await request("POST", `/api/v1/apps/${appId}/clients`, spa);
    expect(created.status).toBe(201);
    const child = await created.json();
    spaId = child.client.id;
    spaClientId = child.client.clientId;
    expect(child.clientSecret).toBeNull();
    expect(child.client.clientType).toBe("public");
    expect(
      (await (await request("GET", `/api/v1/apps/${appId}`)).json())
        .activeClientCount,
    ).toBe(2);
    const list = await (
      await request("GET", `/api/v1/apps/${appId}/clients`)
    ).json();
    expect(list.clients).toHaveLength(2);
    expect(JSON.stringify(list)).not.toContain(serverSecret);
    expect(list.clients[0].clientSecretHash).toBeUndefined();
  });
  test("class, purpose, identity, and Application-level protocol mutations are rejected", async () => {
    for (const patch of [
      { clientType: "public" },
      { purpose: "workload" },
      { clientId: "replacement" },
    ]) {
      expect(
        (
          await request(
            "PATCH",
            `/api/v1/apps/${appId}/clients/${serverId}`,
            patch,
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await request("PATCH", `/api/v1/apps/${appId}`, {
          redirectUris: [REDIRECT],
        })
      ).status,
    ).toBe(400);
    await expect(
      (async () =>
        await getDb()`UPDATE oauth_clients SET client_type = 'confidential' WHERE id = ${spaId}`)(),
    ).rejects.toThrow();
    await expect(
      (async () =>
        await getDb()`UPDATE oauth_clients SET purpose = 'workload' WHERE id = ${serverId}`)(),
    ).rejects.toThrow();
  });
  test("clients own exact redirects and explicitly registered browser origins", async () => {
    const serverClient = await findActiveOAuthClient(serverClientId);
    const publicClient = await findActiveOAuthClient(spaClientId);
    expect(
      serverClient && isAllowedRedirectUri(serverClient, spa.redirectUris[0]!),
    ).toBe(false);
    expect(publicClient && isAllowedRedirectUri(publicClient, REDIRECT)).toBe(
      false,
    );
    expect(await isOAuthCorsOriginAllowed("http://localhost:3001")).toBe(true);
    expect(await isOAuthCorsOriginAllowed("http://localhost:3000")).toBe(false);
    for (const browserOrigins of [
      ["https://app.example.com/path"],
      ["https://*.example.com"],
      ["http://example.com"],
    ]) {
      expect(
        (
          await request("PATCH", `/api/v1/apps/${appId}/clients/${spaId}`, {
            browserOrigins,
          })
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await request("POST", `/api/v1/apps/${appId}/clients`, {
          ...server,
          redirectUris: ["not-a-url"],
        })
      ).status,
    ).toBe(400);
  });
  test("management mutations enforce CSRF and bind child IDs to the parent", async () => {
    expect(
      (await request("POST", `/api/v1/apps/${appId}/clients`, spa, false))
        .status,
    ).toBe(403);
    expect(
      (
        await request(
          "PATCH",
          `/api/v1/apps/${appId}/clients/${spaId}`,
          { label: "Changed" },
          false,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "POST",
          `/api/v1/apps/${appId}/clients/${serverId}/rotate`,
          undefined,
          false,
        )
      ).status,
    ).toBe(403);
    const other = await (
      await request("POST", "/api/v1/apps", {
        name: "Other",
        initialClient: server,
      })
    ).json();
    expect(
      (
        await request(
          "PATCH",
          `/api/v1/apps/${other.app.id}/clients/${spaId}`,
          { label: "Wrong parent" },
        )
      ).status,
    ).toBe(404);
  });
  test("Viewer can inspect clients but cannot mutate configuration", async () => {
    const [user] =
      await getDb()`INSERT INTO users (name, email) VALUES ('Viewer', 'viewer@example.com') RETURNING id`;
    await getDb()`INSERT INTO instance_members (user_id) VALUES (${user.id})`;
    await getDb()`INSERT INTO instance_member_roles (member_user_id, role_id) SELECT ${user.id}, id FROM instance_roles WHERE key = 'viewer'`;
    const session = await createSession(
      String(user.id),
      buildRequest("GET", "/"),
    );
    for (const [method, path, body] of [
      ["GET", `/api/v1/apps/${appId}/clients`, undefined],
      ["POST", `/api/v1/apps/${appId}/clients`, spa],
      [
        "PATCH",
        `/api/v1/apps/${appId}/clients/${spaId}`,
        { label: "Forbidden" },
      ],
      ["POST", `/api/v1/apps/${appId}/clients/${serverId}/rotate`, undefined],
    ] as const) {
      expect(
        (
          await dispatchApi(
            buildRequest(method, path, {
              csrfToken: auth.csrf,
              cookies: { [SESSION_COOKIE]: session.token },
              body,
            }),
          )
        ).status,
      ).toBe(method === "GET" ? 200 : 403);
    }
  });
  test("both clients deliver the same OIDC subject and retain one membership", async () => {
    const [identity] =
      await getDb()`INSERT INTO app_users (app_id, email, name) VALUES (${appId}, 'person@example.com', 'Person') RETURNING id, account_id`;
    const verifier = "a".repeat(43);
    const challenge = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ).toString("base64url");
    const subjects: string[] = [];
    for (const [id, clientId, redirectUri, secret] of [
      [serverId, serverClientId, REDIRECT, serverSecret],
      [spaId, spaClientId, spa.redirectUris[0]!, null],
    ] as const) {
      const code = await issueAuthorizationCode({
        appId,
        appUserId: String(identity.id),
        appCredentialId: id,
        resource: await testResourceForClient(id),
        redirectUri,
        scope: "openid profile",
        codeChallenge: challenge,
        codeChallengeMethod: "S256",
        nonce: null,
      });
      const client = await findActiveOAuthClient(clientId);
      const sibling = await findActiveOAuthClient(
        clientId === serverClientId ? spaClientId : serverClientId,
      );
      expect(
        (
          await exchangeAuthorizationCode({
            code,
            client: sibling!,
            redirectUri,
            codeVerifier: verifier,
          })
        ).ok,
      ).toBe(false);
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });
      if (secret) params.set("client_secret", secret);
      const response = await dispatchWeb(
        new Request("http://localhost/oauth/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: params,
        }),
      );
      expect(response.status).toBe(200);
      const tokens = await response.json();
      subjects.push(
        JSON.parse(
          Buffer.from(tokens.id_token.split(".")[1], "base64url").toString(),
        ).sub,
      );
      const userInfo = await dispatchWeb(
        new Request("http://localhost/oauth/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }),
      );
      expect((await userInfo.json()).sub).toBe(subjects.at(-1));
      expect(client?.appId).toBe(appId);
    }
    expect(subjects[0]).toBe(subjects[1]);
    expect(subjects[0]).toBe(String(identity.id));
    const [count] =
      await getDb()`SELECT COUNT(*)::int AS count FROM application_memberships WHERE subject_id = ${identity.id}`;
    expect(count.count).toBe(1);
  });
  test("refresh is a per-client opt-in and disabling it retires families even for stale client objects", async () => {
    const [identity] =
      await getDb()`SELECT id FROM app_users WHERE app_id = ${appId} AND email = 'person@example.com'`;
    const stale = (await findActiveOAuthClient(serverClientId))!;
    const issue = async () =>
      issueAuthorizationCode({
        appId,
        appUserId: String(identity.id),
        appCredentialId: serverId,
        resource: await testResourceForClient(serverId),
        redirectUri: REDIRECT,
        scope: "openid",
        codeChallenge: null,
        codeChallengeMethod: null,
        nonce: null,
      });
    const first = await exchangeAuthorizationCode({
      code: await issue(),
      client: stale,
      redirectUri: REDIRECT,
    });
    expect(first.ok && first.refreshToken).toBeTruthy();
    await request("PATCH", `/api/v1/apps/${appId}/clients/${serverId}`, {
      refreshEnabled: false,
    });
    if (first.ok)
      expect(
        (
          await exchangeRefreshToken({
            refreshToken: first.refreshToken!,
            client: stale,
          })
        ).ok,
      ).toBe(false);
    const secondCode = await issue();
    await request("PATCH", `/api/v1/apps/${appId}/clients/${serverId}`, {
      refreshEnabled: true,
    });
    const second = await exchangeAuthorizationCode({
      code: secondCode,
      client: stale,
      redirectUri: REDIRECT,
    });
    if (!second.ok) throw new Error("Expected code redemption");
    await Promise.all([
      exchangeRefreshToken({
        refreshToken: second.refreshToken!,
        client: stale,
      }),
      request("PATCH", `/api/v1/apps/${appId}/clients/${serverId}`, {
        refreshEnabled: false,
      }),
    ]);
    const [remaining] =
      await getDb()`SELECT COUNT(*)::int AS count FROM oauth_refresh_tokens WHERE app_credential_id = ${serverId} AND revoked_at IS NULL`;
    expect(remaining.count).toBe(0);
    const disabled = await exchangeAuthorizationCode({
      code: await issue(),
      client: stale,
      redirectUri: REDIRECT,
    });
    expect(disabled.ok).toBe(true);
    expect(disabled.ok && disabled.refreshToken).toBeUndefined();
    await request("PATCH", `/api/v1/apps/${appId}/clients/${serverId}`, {
      refreshEnabled: true,
    });
    if (first.ok)
      expect(
        (
          await exchangeRefreshToken({
            refreshToken: first.refreshToken!,
            client: stale,
          })
        ).ok,
      ).toBe(false);
    expect(
      (await issueClientCredentialsToken({ client: stale, scope: "openid" }))
        .ok,
    ).toBe(false);
  });
  test("client-specific strong assurance cannot weaken the parent, including concurrent policy changes", async () => {
    expect(
      (
        await request("PATCH", `/api/v1/apps/${appId}/clients/${spaId}`, {
          assuranceOverride: "strong",
        })
      ).status,
    ).toBe(200);
    expect((await findActiveOAuthClient(spaClientId))?.effectiveAssurance).toBe(
      "strong",
    );
    expect(
      (
        await request("PATCH", `/api/v1/apps/${appId}`, {
          minimumAssurance: "strong",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("PATCH", `/api/v1/apps/${appId}/clients/${serverId}`, {
          assuranceOverride: "baseline",
        })
      ).status,
    ).toBe(400);
    await expect(
      (async () =>
        await getDb()`UPDATE oauth_clients SET assurance_override = 'baseline' WHERE id = ${serverId}`)(),
    ).rejects.toThrow();
    expect(
      (
        await request("PATCH", `/api/v1/apps/${appId}/clients/${serverId}`, {
          assuranceOverride: null,
        })
      ).status,
    ).toBe(200);
    expect(
      (await findActiveOAuthClient(serverClientId))?.effectiveAssurance,
    ).toBe("strong");
    const attempts = await Promise.all([
      request("PATCH", `/api/v1/apps/${appId}`, {
        minimumAssurance: "baseline",
      }),
      request("PATCH", `/api/v1/apps/${appId}/clients/${serverId}`, {
        assuranceOverride: "baseline",
      }),
    ]);
    expect(attempts[0].status).toBe(200);
    await request("PATCH", `/api/v1/apps/${appId}`, {
      minimumAssurance: "strong",
    });
    const [row] =
      await getDb()`SELECT assurance_override FROM oauth_clients WHERE id = ${serverId}`;
    expect(row.assurance_override).not.toBe("baseline");
  });
  test("strong policy rejects weak browser proof and weak pre-existing codes and refresh grants", async () => {
    await request("PATCH", `/api/v1/apps/${appId}`, {
      minimumAssurance: "baseline",
    });
    const [identity] =
      await getDb()`SELECT id FROM app_users WHERE app_id = ${appId} AND email = 'person@example.com'`;
    const client = (await findActiveOAuthClient(serverClientId))!;
    const weakCode = await issueAuthorizationCode({
      appId,
      appUserId: String(identity.id),
      appCredentialId: serverId,
        resource: await testResourceForClient(serverId),
      redirectUri: REDIRECT,
      scope: "openid",
      codeChallenge: null,
      codeChallengeMethod: null,
      nonce: null,
    });
    const weakTokens = await exchangeAuthorizationCode({
      code: await issueAuthorizationCode({
        appId,
        appUserId: String(identity.id),
        appCredentialId: serverId,
        resource: await testResourceForClient(serverId),
        redirectUri: REDIRECT,
        scope: "openid",
        codeChallenge: null,
        codeChallengeMethod: null,
        nonce: null,
      }),
      client,
      redirectUri: REDIRECT,
    });
    expect(weakTokens.ok && weakTokens.refreshToken).toBeTruthy();
    await request("PATCH", `/api/v1/apps/${appId}`, {
      minimumAssurance: "strong",
    });
    if (weakTokens.ok)
      expect(
        (
          await exchangeRefreshToken({
            refreshToken: weakTokens.refreshToken!,
            client,
          })
        ).ok,
      ).toBe(false);
    expect(
      (
        await exchangeAuthorizationCode({
          code: weakCode,
          client,
          redirectUri: REDIRECT,
        })
      ).ok,
    ).toBe(false);
    const session = await createAppSession(
      String(identity.id),
      appId,
      buildRequest("GET", "/"),
    );
    const authorize = async () =>
      dispatchWeb(
        new Request(
          `http://localhost/oauth/authorize?response_type=code&client_id=${serverClientId}&resource=${encodeURIComponent(await testResourceForClient(serverClientId))}&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=openid`,
          { headers: { cookie: `${APP_SESSION_COOKIE}=${session.token}` } },
        ),
      );
    expect((await authorize()).status).toBe(403);
    const [strongSession] = await getDb()`UPDATE app_user_sessions SET mfa_authenticated_at = NOW()
      WHERE app_user_id = ${identity.id} AND revoked_at IS NULL RETURNING id`;
    expect((await authorize()).status).toBe(200); // strong proof can now reach protocol completion
    const strongCode = await issueAuthorizationCode({
      appId,
      appUserId: String(identity.id),
      appCredentialId: serverId,
        resource: await testResourceForClient(serverId),
      redirectUri: REDIRECT,
      scope: "openid",
      codeChallenge: null,
      codeChallengeMethod: null,
      nonce: null,
      sessionId: String(strongSession.id),
    });
    const strongTokens = await exchangeAuthorizationCode({
      code: strongCode,
      client,
      redirectUri: REDIRECT,
    });
    expect(strongTokens.ok && strongTokens.refreshToken).toBeTruthy();
    if (!strongTokens.ok) throw new Error("Expected strong code redemption");
    expect((await exchangeRefreshToken({
      refreshToken: strongTokens.refreshToken!,
      client,
    })).ok).toBe(true);
  });
  test("authorization completion waits for application containment without locking its challenge first", async () => {
    const created = await (await request("POST", "/api/v1/apps", {
      name: "Concurrent containment",
      initialClient: server,
    })).json();
    const [identity] = await getDb()`INSERT INTO app_users (app_id, email, name)
      VALUES (${created.app.id}, 'race@example.com', 'Race') RETURNING id`;
    const authorization = createAuthorizationServer({
      consentChallenges: createPostgresOAuthConsentChallengeAuthority(),
    });
    const input = {
      responseType: "code" as const,
      resource: await testResourceForClient(created.client.clientId),
      appId: created.app.id,
      appUserId: String(identity.id),
      clientId: created.client.clientId,
      redirectUri: REDIRECT,
      scope: "openid",
      state: "containment-race",
      codeChallenge: null,
      codeChallengeMethod: null,
      oidcNonce: null,
    };
    const challenge = await authorization.beginConsent(input);
    let completion: ReturnType<typeof authorization.completeConsent> | undefined;
    try {
      await getDb().begin(async (tx) => {
        const [parent] = await tx`SELECT id, pg_backend_pid() AS pid FROM apps
          WHERE id = ${created.app.id} FOR UPDATE`;
        completion = authorization.completeConsent({
          ...input,
          nonce: challenge.nonce,
          confirmationNonce: challenge.nonce,
          decision: "approve",
        });
        // Observe the actual lock wait before running containment so this
        // exercises the overlapping transactions on every test run.
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const [blocked] = await getDb()`SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity WHERE ${parent.pid}::int = ANY(pg_blocking_pids(pid))
          ) AS waiting`;
          if (blocked.waiting) { waiting = true; break; }
          await Bun.sleep(10);
        }
        expect(waiting).toBe(true);
        await tx`UPDATE apps SET status = 'disabled' WHERE id = ${created.app.id}`;
        await containApplication(tx, created.app.id);
      });
      expect((await completion!).outcome).toBe("replayed");
      expect(await getDb()`SELECT id FROM oauth_authorization_codes
        WHERE app_id = ${created.app.id}`).toHaveLength(0);
    } finally {
      await completion;
    }
  });
  test("secret rotation keeps the Client ID and public clients have no secret", async () => {
    const response = await request(
      "POST",
      `/api/v1/apps/${appId}/clients/${serverId}/rotate`,
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.client.clientId).toBe(serverClientId);
    expect(result.clientSecret).not.toBe(serverSecret);
    expect(
      await verifyOAuthClientSecret(
        (await findActiveOAuthClient(serverClientId))!,
        serverSecret,
      ),
    ).toBe(false);
    expect(
      (await request("POST", `/api/v1/apps/${appId}/clients/${spaId}/rotate`))
        .status,
    ).toBe(409);
  });
  test("disabling clients and their parent blocks new issuance", async () => {
    expect(
      (
        await request("PATCH", `/api/v1/apps/${appId}/clients/${spaId}`, {
          status: "disabled",
        })
      ).status,
    ).toBe(200);
    expect(await findActiveOAuthClient(spaClientId)).toBeNull();
    expect(await findActiveOAuthClient(serverClientId)).not.toBeNull();
    await request("PATCH", `/api/v1/apps/${appId}`, { status: "disabled" });
    expect(await findActiveOAuthClient(serverClientId)).toBeNull();
    expect(
      (await request("POST", `/api/v1/apps/${appId}/clients`, server)).status,
    ).toBe(409);
  });
});
