import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { sha256Hex } from "../../src/api/lib/crypto";
import { createPgSql } from "../../src/api/lib/create-pg-sql";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import {
  createRefreshTokenExchange,
  findActiveOAuthClient,
} from "../../src/api/lib/oauth";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { resetRateLimitsForTests } from "../../src/api/lib/rate-limit";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { approveOAuthConsent, loginApplicationIdentity } from "../helpers/oauth";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";
import { dispatchWeb } from "./web-dispatch";

const run = hasTestDatabase() ? describe : describe.skip;

const ownerPassword = makeStrongPassword();
const appUserPassword = makeStrongPassword();
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

async function ownerLogin() {
  const csrf = await fetchCsrfToken(dispatchApi);
  const res = await dispatchApi(
    buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "owner@example.com", password: ownerPassword },
    }),
  );
  return { csrf, cookie: sessionCookieFromResponse(res)! };
}

async function approveConsent(input: {
  clientId: string;
  redirectUri: string;
  appSession: string;
  scope?: string;
}): Promise<string> {
  return approveOAuthConsent(dispatchWeb, {
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    appSession: input.appSession,
    scope: input.scope ?? "openid profile email",
    state: "refresh-test-state",
  });
}

async function exchangeToken(body: Record<string, string>, idempotencyKey?: string): Promise<Response> {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  return dispatchWeb(
    new Request("http://localhost/oauth/token", {
      method: "POST",
      headers,
      body: new URLSearchParams(body).toString(),
    }),
  );
}

run("OAuth refresh token lifecycle", () => {
  let clientId = "";
  let clientSecret = "";
  let appId = "";
  let ownerCookie = "";
  let appUserEmail = "refresh-user@example.com";

  beforeAll(async () => {
    await resetTestDatabase();
    resetRateLimitsForTests();
    await completeSetup();
    const { csrf, cookie } = await ownerLogin();
    ownerCookie = cookie;

    const appRes = await dispatchApi(
      buildRequest("POST", "/api/v1/apps", {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: { name: "Refresh App", redirectUris: [REDIRECT], clientType: "confidential" },
      }),
    );
    const app = (await appRes.json()) as {
      app: { id: string };
      credential: { clientId: string };
      clientSecret: string;
    };
    clientId = app.credential.clientId;
    clientSecret = app.clientSecret;
    appId = app.app.id;

    await dispatchApi(
      buildRequest("POST", `/api/v1/apps/${app.app.id}/users`, {
        csrfToken: csrf,
        cookies: { [SESSION_COOKIE]: cookie },
        body: {
          email: appUserEmail,
          name: "Refresh User",
          password: appUserPassword,
          passwordConfirm: appUserPassword,
        },
      }),
    );
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("code exchange returns refresh_token", async () => {
    const appSession = await loginApplicationIdentity(dispatchWeb, {
      clientId,
      email: appUserEmail,
      password: appUserPassword,
    });
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(tokenRes.status).toBe(200);
    const token = (await tokenRes.json()) as { refresh_token?: string; access_token: string };
    expect(token.refresh_token?.startsWith("z0_rt_")).toBe(true);
    expect(token.access_token.startsWith("z0_at_")).toBe(true);
  });

  test("refresh_token grant rotates tokens", async () => {
    const appSession = await loginApplicationIdentity(dispatchWeb, {
      clientId,
      email: appUserEmail,
      password: appUserPassword,
    });
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const first = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const firstBody = (await first.json()) as { refresh_token: string; access_token: string };

    const refreshed = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: firstBody.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(refreshed.status).toBe(200);
    const refreshedBody = (await refreshed.json()) as { refresh_token: string; access_token: string };
    expect(refreshedBody.refresh_token).not.toBe(firstBody.refresh_token);
    expect(refreshedBody.access_token).not.toBe(firstBody.access_token);

    const reuse = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: firstBody.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(reuse.status).toBe(400);
    const reuseBody = (await reuse.json()) as { error: string };
    expect(reuseBody.error).toBe("invalid_grant");

    const secondRefresh = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: refreshedBody.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(secondRefresh.status).toBe(400);
    const secondRefreshBody = (await secondRefresh.json()) as { error: string };
    expect(secondRefreshBody.error).toBe("invalid_grant");
  });

  test("two Application Replicas return one outcome for an identical narrow retry", async () => {
    const appSession = await loginApplicationIdentity(dispatchWeb, {
      clientId,
      email: appUserEmail,
      password: appUserPassword,
    });
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const token = (await tokenRes.json()) as { refresh_token: string };
    const refreshRequest = {
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    };

    const client = await findActiveOAuthClient(clientId);
    expect(client).not.toBeNull();
    const firstReplicaDatabase = createPgSql(process.env.DATABASE_URL!);
    const secondReplicaDatabase = createPgSql(process.env.DATABASE_URL!);
    try {
      const firstReplica = createRefreshTokenExchange(firstReplicaDatabase);
      const secondReplica = createRefreshTokenExchange(secondReplicaDatabase);
      const [first, retry] = await Promise.all([
        firstReplica({
          refreshToken: refreshRequest.refresh_token,
          client: client!,
          retryKey: "retry-refresh-rotation-0001",
        }),
        secondReplica({
          refreshToken: refreshRequest.refresh_token,
          client: client!,
          retryKey: "retry-refresh-rotation-0001",
        }),
      ]);

      expect(first.ok).toBe(true);
      expect(retry.ok).toBe(true);
      expect(retry).toEqual(first);
    } finally {
      await Promise.all([firstReplicaDatabase.close(), secondReplicaDatabase.close()]);
    }
  });

  test("competing reuse revokes the complete family and records high-severity evidence", async () => {
    const appSession = await loginApplicationIdentity(dispatchWeb, {
      clientId,
      email: appUserEmail,
      password: appUserPassword,
    });
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const original = (await tokenRes.json()) as { refresh_token: string; access_token: string };
    const refreshRequest = {
      grant_type: "refresh_token",
      refresh_token: original.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    };
    const rotated = await exchangeToken(refreshRequest, "legitimate-refresh-rotation");
    const replacement = (await rotated.json()) as { refresh_token: string; access_token: string };

    const competingReuse = await exchangeToken(refreshRequest, "competing-refresh-rotation");
    expect(competingReuse.status).toBe(400);
    const repeatedCompetingReuse = await exchangeToken(refreshRequest, "another-competing-rotation");
    expect(repeatedCompetingReuse.status).toBe(400);

    const replacementUse = await exchangeToken({
      ...refreshRequest,
      refresh_token: replacement.refresh_token,
    });
    expect(replacementUse.status).toBe(400);

    for (const accessToken of [original.access_token, replacement.access_token]) {
      const userinfo = await dispatchWeb(new Request("http://localhost/oauth/userinfo", {
        headers: { authorization: `Bearer ${accessToken}` },
      }));
      expect(userinfo.status).toBe(401);
    }

    const auditRes = await dispatchApi(buildRequest(
      "GET",
      "/api/v1/audit-events?action=oauth.refresh_token_reuse_detected",
      { cookies: { [SESSION_COOKIE]: ownerCookie } },
    ));
    expect(auditRes.status).toBe(200);
    const audit = (await auditRes.json()) as {
      events: Array<{ resourceType: string; resourceId: string; payload: Record<string, unknown> }>;
    };
    expect(audit.events[0]).toMatchObject({
      resourceType: "oauth_refresh_token_family",
      payload: {
        schemaVersion: 1,
        severity: "high",
        outcome: "family_revoked",
        appId,
      },
    });
    expect(audit.events[0]?.payload.securityEventId).toBeString();
    const compromisedFamilyId = audit.events[0]?.resourceId;
    expect(audit.events.filter((event) => event.resourceId === compromisedFamilyId)).toHaveLength(1);
  });

  test("revoking refresh token rejects further refresh", async () => {
    const appSession = await loginApplicationIdentity(dispatchWeb, {
      clientId,
      email: appUserEmail,
      password: appUserPassword,
    });
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const token = (await tokenRes.json()) as { refresh_token: string };

    const revokeRes = await dispatchWeb(
      new Request("http://localhost/oauth/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: token.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      }),
    );
    expect(revokeRes.status).toBe(200);

    const refreshRes = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(refreshRes.status).toBe(400);
  });

  test("revoking a rotated family also invalidates its retry outcome", async () => {
    const appSession = await loginApplicationIdentity(dispatchWeb, {
      clientId,
      email: appUserEmail,
      password: appUserPassword,
    });
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const original = (await tokenRes.json()) as { refresh_token: string };
    const refreshRequest = {
      grant_type: "refresh_token",
      refresh_token: original.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    };
    const rotated = await exchangeToken(refreshRequest, "revoked-refresh-rotation");
    const replacement = (await rotated.json()) as { refresh_token: string };

    const revokeRes = await dispatchWeb(
      new Request("http://localhost/oauth/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: replacement.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      }),
    );
    expect(revokeRes.status).toBe(200);

    const retry = await exchangeToken(refreshRequest, "revoked-refresh-rotation");
    expect(retry.status).toBe(400);
  });

  test("a matching retry outside the narrow window revokes the family", async () => {
    const appSession = await loginApplicationIdentity(dispatchWeb, {
      clientId,
      email: appUserEmail,
      password: appUserPassword,
    });
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const original = (await tokenRes.json()) as { refresh_token: string };
    const refreshRequest = {
      grant_type: "refresh_token",
      refresh_token: original.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    };
    const rotated = await exchangeToken(refreshRequest, "expired-refresh-rotation");
    const replacement = (await rotated.json()) as { refresh_token: string };
    const originalHash = await sha256Hex(original.refresh_token);
    await getDb()`
      UPDATE oauth_refresh_tokens
      SET retry_expires_at = NOW() - INTERVAL '1 second'
      WHERE token_hash = ${originalHash}
    `;

    const lateRetry = await exchangeToken(refreshRequest, "expired-refresh-rotation");
    expect(lateRetry.status).toBe(400);
    const replacementUse = await exchangeToken({
      ...refreshRequest,
      refresh_token: replacement.refresh_token,
    });
    expect(replacementUse.status).toBe(400);
  });

  test("deleted scopes cannot be renewed by a refresh token", async () => {
    const appSession = await loginApplicationIdentity(dispatchWeb, {
      clientId,
      email: appUserEmail,
      password: appUserPassword,
    });
    const code = await approveConsent({ clientId, redirectUri: REDIRECT, appSession });
    const tokenRes = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const token = (await tokenRes.json()) as { refresh_token: string };

    await getDb()`DELETE FROM app_scopes WHERE app_id = ${appId} AND name = 'profile'`;
    const refreshRes = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(refreshRes.status).toBe(400);
    expect(((await refreshRes.json()) as { error: string }).error).toBe("invalid_grant");
  });
});
