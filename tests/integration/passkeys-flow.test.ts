import { beforeAll, describe, expect, test } from "bun:test";

import type { PasskeyList } from "@z0/contracts/passkeys";
import { PASSKEY_CEREMONY_COOKIE } from "../../src/api/lib/passkeys";
import { getDb } from "../../src/api/lib/db";
import { SESSION_COOKIE } from "../../src/api/lib/session";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { buildRequest, fetchCsrfToken } from "../helpers/http";
import { makeStrongPassword } from "../helpers/password";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;
const password = makeStrongPassword("PasskeyOwner");

function cookieFromResponse(response: Response, name: string): string | undefined {
  const raw = response.headers.getSetCookie?.().find((cookie) => cookie.startsWith(`${name}=`));
  const match = raw?.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

run("passkey ceremonies", () => {
  let csrf: string;
  let session: string;
  let userId: string;
  let appId: string;
  let clientId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    csrf = await fetchCsrfToken(dispatchApi);
    const setup = await dispatchApi(buildRequest("POST", "/api/setup", {
      csrfToken: csrf,
      body: {
        name: "Passkey Owner",
        email: "passkey-owner@example.com",
        password,
        passwordConfirm: password,
        organizationName: "Passkey Test",
      },
    }));
    expect(setup.status).toBe(201);
    userId = String(((await setup.json()) as { user: { id: string } }).user.id);
    const login = await dispatchApi(buildRequest("POST", "/api/auth/login", {
      csrfToken: csrf,
      body: { email: "passkey-owner@example.com", password },
    }));
    session = cookieFromResponse(login, SESSION_COOKIE)!;
    const app = await dispatchApi(buildRequest("POST", "/api/v1/apps", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: session },
      body: {
        name: "Passkey App",
        redirectUris: ["http://localhost:3000/oauth/callback"],
        clientType: "public",
      },
    }));
    expect(app.status).toBe(201);
    const created = (await app.json()) as { app: { id: string }; credential: { clientId: string } };
    appId = created.app.id;
    clientId = created.credential.clientId;
  }, 15_000);

  test("starts strict registration and keeps safe list output", async () => {
    const list = await dispatchApi(buildRequest("GET", "/api/auth/passkeys", {
      cookies: { [SESSION_COOKIE]: session },
    }));
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ passkeys: [], canRegister: true, maxPasskeys: 10 } satisfies PasskeyList);

    const start = await dispatchApi(buildRequest("POST", "/api/auth/passkeys/registration/options", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: session },
      body: {},
    }));
    expect(start.status).toBe(200);
    expect(start.headers.get("cache-control")).toBe("no-store");
    expect(cookieFromResponse(start, PASSKEY_CEREMONY_COOKIE)).toBeDefined();
    const body = (await start.json()) as { options: Record<string, any> };
    expect(body.options.rp.id).toBe("localhost");
    expect(body.options.user.name).toBe("passkey-owner@example.com");
    expect(body.options.user.id).not.toContain(userId);
    expect(body.options.authenticatorSelection).toMatchObject({ residentKey: "preferred", userVerification: "required" });
    expect(body.options.attestation).toBe("none");
    expect(body.options.pubKeyCredParams.map((item: { alg: number }) => item.alg)).toEqual([-7, -257]);
  });

  test("returns a fixed-size scoped allow-list for existing and missing emails", async () => {
    const credentialId = "dGVzdC1wYXNza2V5LWNyZWRlbnRpYWw";
    await getDb().begin(async (tx) => {
      await tx`INSERT INTO passkey_credential_registry (credential_id, realm) VALUES (${credentialId}, 'console')`;
      await tx`
        INSERT INTO user_passkeys (user_id, credential_id, public_key, algorithm, label)
        VALUES (${userId}, ${credentialId}, 'AA==', -7, 'Test passkey')
      `;
    });

    const existing = await dispatchApi(buildRequest("POST", "/api/auth/passkeys/authentication/options", {
      csrfToken: csrf,
      body: { email: "passkey-owner@example.com" },
    }));
    const missing = await dispatchApi(buildRequest("POST", "/api/auth/passkeys/authentication/options", {
      csrfToken: csrf,
      body: { email: "missing@example.com" },
    }));
    const existingAgain = await dispatchApi(buildRequest("POST", "/api/auth/passkeys/authentication/options", {
      csrfToken: csrf,
      body: { email: "passkey-owner@example.com" },
    }));
    const missingAgain = await dispatchApi(buildRequest("POST", "/api/auth/passkeys/authentication/options", {
      csrfToken: csrf,
      body: { email: "missing@example.com" },
    }));
    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    const existingOptions = ((await existing.json()) as { options: { allowCredentials: Array<Record<string, unknown>> } }).options;
    const missingOptions = ((await missing.json()) as { options: { allowCredentials: Array<Record<string, unknown>> } }).options;
    const existingAgainOptions = ((await existingAgain.json()) as { options: { allowCredentials: Array<Record<string, unknown>> } }).options;
    const missingAgainOptions = ((await missingAgain.json()) as { options: { allowCredentials: Array<Record<string, unknown>> } }).options;
    expect(existingOptions.allowCredentials).toHaveLength(10);
    expect(missingOptions.allowCredentials).toHaveLength(10);
    expect(existingOptions.allowCredentials.some((item) => item.id === credentialId)).toBeTrue();
    expect(missingOptions.allowCredentials.some((item) => item.id === credentialId)).toBeFalse();
    expect(existingOptions.allowCredentials.every((item) => !("transports" in item))).toBeTrue();
    expect(missingOptions.allowCredentials.every((item) => !("transports" in item))).toBeTrue();
    expect(existingAgainOptions.allowCredentials).toEqual(existingOptions.allowCredentials);
    expect(missingAgainOptions.allowCredentials).toEqual(missingOptions.allowCredentials);
  });

  test("validates names and requires fresh strong proof before removal", async () => {
    const [stored] = await getDb()`
      SELECT id, credential_id FROM user_passkeys
      WHERE user_id = ${userId} AND removed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `;
    const passkeyId = String((stored as { id: string }).id);
    const credentialId = String((stored as { credential_id: string }).credential_id);

    const emptyRename = await dispatchApi(buildRequest("POST", "/api/auth/passkeys/rename", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: session },
      body: { passkeyId, label: "   " },
    }));
    expect(emptyRename.status).toBe(400);
    expect(((await emptyRename.json()) as { errors: Array<{ code: string }> }).errors[0]?.code).toBe("passkey_name_invalid");

    const rename = await dispatchApi(buildRequest("POST", "/api/auth/passkeys/rename", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: session },
      body: { passkeyId, label: "Security key" },
    }));
    expect(rename.status).toBe(200);

    const staleRemoval = await dispatchApi(buildRequest("POST", "/api/auth/passkeys/remove", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: session },
      body: { passkeyId },
    }));
    expect(staleRemoval.status).toBe(403);
    expect(((await staleRemoval.json()) as { errors: Array<{ code: string }> }).errors[0]?.code).toBe("passkey_step_up_required");

    await getDb()`UPDATE sessions SET mfa_authenticated_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
    const removal = await dispatchApi(buildRequest("POST", "/api/auth/passkeys/remove", {
      csrfToken: csrf,
      cookies: { [SESSION_COOKIE]: session },
      body: { passkeyId },
    }));
    expect(removal.status).toBe(200);
    const [registry] = await getDb()`SELECT active, removed_at FROM passkey_credential_registry WHERE credential_id = ${credentialId}`;
    expect(Boolean((registry as { active: boolean }).active)).toBeFalse();
    expect((registry as { removed_at: Date | null }).removed_at).not.toBeNull();
  });

  test("does not start app passkey authentication while the application is disabled", async () => {
    await getDb()`UPDATE apps SET status = 'disabled', disabled_at = NOW() WHERE id = ${appId}`;
    const response = await dispatchApi(buildRequest("POST", "/api/auth/passkeys/authentication/options", {
      csrfToken: csrf,
      body: { clientId, email: "app-user@example.com" },
    }));
    expect(response.status).toBe(403);
    await getDb()`UPDATE apps SET status = 'active', disabled_at = NULL WHERE id = ${appId}`;
  });
});
