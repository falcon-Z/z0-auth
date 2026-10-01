import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { BunRequest } from "bun";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import { ensureApplicationSubject } from "../../src/api/lib/accounts";
import { APP_SESSION_COOKIE, createAppSession, resolveAppSessionForApp } from "../../src/api/lib/app-session";
import { createServiceGroup } from "../../src/api/lib/service-groups";
import { finishPasskeyAuthentication, listPasskeys, PASSKEY_CEREMONY_COOKIE, removePasskey, renamePasskey, requireFreshPasskeyChange, startPasskeyAuthentication, startPasskeyRegistration } from "../../src/api/lib/passkeys";
import { buildRequest } from "../helpers/http";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";

const run = hasTestDatabase() ? describe : describe.skip;
const email = "shared-passkey@example.com";
const credentialId = Buffer.from("canonical-account-passkey").toString("base64url");
const userHandle = "ab".repeat(32);
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = keys.publicKey.export({ format: "jwk" });
// EC2 COSE key: kty=2, alg=ES256, crv=P-256, x, y.
const publicKey = Buffer.concat([Buffer.from([0xa5, 1, 2, 3, 0x26, 0x20, 1, 0x21, 0x58, 0x20]), Buffer.from(jwk.x!, "base64url"), Buffer.from([0x22, 0x58, 0x20]), Buffer.from(jwk.y!, "base64url")]).toString("base64");
function request(cookies: Record<string, string> = {}): BunRequest {
  return buildRequest("POST", "/api/auth/passkeys/authentication/verify", { cookies }) as BunRequest;
}
function assertion(challenge: string, counter: number): AuthenticationResponseJSON {
  const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: "http://localhost", crossOrigin: false }));
  const authData = Buffer.concat([createHash("sha256").update("localhost").digest(), Buffer.from([0x05]), Buffer.alloc(4)]);
  authData.writeUInt32BE(counter, 33);
  const signature = sign("sha256", Buffer.concat([authData, createHash("sha256").update(clientData).digest()]), keys.privateKey);
  return { id: credentialId, rawId: credentialId, type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: clientData.toString("base64url"), authenticatorData: authData.toString("base64url"), signature: signature.toString("base64url"), userHandle: Buffer.from(userHandle, "hex").toString("base64url") } };
}
function ceremonyCookie(header: string) {
  return decodeURIComponent(header.match(/^[^=]+=([^;]+)/)![1]!);
}

run("canonical Account passkeys in shared SSO domains", () => {
  let a: string; let b: string; let outside: string; let unjoined: string;
  let subjectA: string; let subjectB: string; let outsideSubject: string; let accountId: string; let passkeyId: string;
  beforeEach(async () => {
    await resetTestDatabase();
    const ids: string[] = [];
    for (const slug of ["a", "b", "outside", "unjoined"]) {
      const [app] = await getDb()`INSERT INTO apps (name, slug, client_type, redirect_uris) VALUES (${slug}, ${slug}, 'public', '{}') RETURNING id`;
      ids.push(String(app.id));
    }
    [a, b, outside, unjoined] = ids as [string, string, string, string];
    expect((await createServiceGroup({ name: "Shared", appIds: [a, b, unjoined] })).ok).toBe(true);
    const [person] = await getDb()`INSERT INTO app_users (app_id, email, name) VALUES (${a}, ${email}, 'Shared person') RETURNING id, account_id`;
    subjectA = String(person.id); accountId = String(person.account_id);
    subjectB = (await getDb().begin(async tx => {
      const subject = await ensureApplicationSubject(tx, b, accountId);
      await tx`INSERT INTO application_memberships (subject_id, status) VALUES (${subject!}, 'active')`;
      return subject!;
    }));
    const [isolated] = await getDb()`INSERT INTO app_users (app_id, email, name) VALUES (${outside}, ${email}, 'Independent person') RETURNING id`;
    outsideSubject = String(isolated.id);
    await getDb()`INSERT INTO app_user_passkey_handles (app_user_id, app_id, user_handle) VALUES (${subjectA}, ${a}, ${userHandle})`;
    await getDb()`INSERT INTO passkey_credential_registry (credential_id, realm) VALUES (${credentialId}, 'app')`;
    const [key] = await getDb()`INSERT INTO app_user_passkeys (app_user_id, app_id, credential_id, public_key, algorithm, label) VALUES (${subjectA}, ${a}, ${credentialId}, ${publicKey}, -7, 'Account key') RETURNING id`;
    passkeyId = String(key.id);
  });
  afterAll(closeDatabase);

  async function start(appId: string) {
    const result = await startPasskeyAuthentication(request(), { realm: "app", appId, email });
    if (!result.ok) throw new Error(await result.response.text());
    return result;
  }
  async function prove(appId: string, counter: number) {
    const options = await start(appId);
    return finishPasskeyAuthentication(request({ [PASSKEY_CEREMONY_COOKIE]: ceremonyCookie(options.setCookie) }), assertion(options.options.challenge, counter));
  }

  test("a genuine assertion from an A-enrolled credential signs in B using its own existing membership and subject", async () => {
    const options = await start(b);
    expect(options.options.allowCredentials?.some(value => value.id === credentialId)).toBe(true);
    const completed = await finishPasskeyAuthentication(request({ [PASSKEY_CEREMONY_COOKIE]: ceremonyCookie(options.setCookie) }), assertion(options.options.challenge, 1));
    if (!completed.ok) throw new Error(await completed.response.text());
    expect(completed.context).toEqual({ realm: "app", appId: b, appUserId: subjectB });
    const active = await resolveAppSessionForApp(request({ [APP_SESSION_COOKIE]: ceremonyCookie(completed.setCookie!) }), b);
    expect(active?.appUserId).toBe(subjectB);
    expect(await getDb()`SELECT id FROM accounts WHERE id = ${accountId}`).toHaveLength(1);
    expect(await getDb()`SELECT id FROM app_account_bindings WHERE account_id = ${accountId}`).toHaveLength(2);
    const registration = await startPasskeyRegistration(request(), { realm: "app", appId: b, appUserId: subjectB }, active!.sessionId);
    if (!registration.ok) throw new Error(await registration.response.text());
    expect(registration.options.user.id).toBe(Buffer.from(userHandle, "hex").toString("base64url"));
    expect(registration.options.excludeCredentials?.some(value => value.id === credentialId)).toBe(true);
    expect(await getDb()`SELECT user_handle FROM app_user_passkey_handles WHERE account_id = ${accountId}`).toHaveLength(1);
  });

  test("independent domains and absent or disabled target memberships cannot use the credential", async () => {
    for (const appId of [outside, unjoined]) {
      expect((await start(appId)).options.allowCredentials?.some(value => value.id === credentialId)).toBe(false);
      expect((await prove(appId, 1)).ok).toBe(false);
    }
    expect(await getDb()`SELECT id FROM app_account_bindings WHERE app_id = ${unjoined}`).toHaveLength(0);
    await getDb()`UPDATE application_memberships SET status = 'disabled', disabled_at = NOW() WHERE subject_id = ${subjectB}`;
    expect((await prove(b, 1)).ok).toBe(false);
    await getDb()`DELETE FROM application_memberships WHERE subject_id = ${subjectB}`;
    expect((await prove(b, 1)).ok).toBe(false);
    expect(await getDb()`SELECT subject_id FROM application_memberships WHERE subject_id = ${subjectB}`).toHaveLength(0);
  });

  test("the shared listing, label, limit and removal operate on one canonical Account", async () => {
    const contextA = { realm: "app" as const, appId: a, appUserId: subjectA };
    const contextB = { realm: "app" as const, appId: b, appUserId: subjectB };
    expect((await listPasskeys(contextB)).passkeys.map(key => key.id)).toEqual([passkeyId]);
    expect((await listPasskeys({ realm: "app", appId: outside, appUserId: outsideSubject })).passkeys).toEqual([]);
    expect(await renamePasskey(contextB, passkeyId, "Renamed in B")).toBe(true);
    expect((await listPasskeys(contextA)).passkeys[0]?.label).toBe("Renamed in B");
    expect(await renamePasskey({ realm: "app", appId: outside, appUserId: outsideSubject }, passkeyId, "Unauthorized")).toBe(false);
    const source = await createAppSession(subjectA, a, request());
    const proof = await prove(b, 1);
    if (!proof.ok) throw new Error(await proof.response.text());
    const targetToken = ceremonyCookie(proof.setCookie!);
    const target = await resolveAppSessionForApp(request({ [APP_SESSION_COOKIE]: targetToken }), b);
    expect(await removePasskey(contextB, passkeyId, target!.sessionId)).toBe(true);
    expect((await listPasskeys(contextA)).passkeys).toEqual([]);
    expect(await resolveAppSessionForApp(request({ [APP_SESSION_COOKIE]: source.token }), a)).toBeNull();
    expect(await resolveAppSessionForApp(request({ [APP_SESSION_COOKIE]: targetToken }), b)).not.toBeNull();
    expect((await prove(a, 2)).ok).toBe(false);
  });

  test("the enrollment limit counts credentials enrolled through either application", async () => {
    for (let index = 1; index < 10; index++) {
      const id = Buffer.from(`shared-extra-${index}`).toString("base64url");
      await getDb()`INSERT INTO passkey_credential_registry (credential_id, realm) VALUES (${id}, 'app')`;
      await getDb()`INSERT INTO app_user_passkeys (app_user_id, app_id, credential_id, public_key, algorithm, label)
        VALUES (${index % 2 ? subjectA : subjectB}, ${index % 2 ? a : b}, ${id}, ${publicKey}, -7, 'Extra')`;
    }
    const context = { realm: "app" as const, appId: b, appUserId: subjectB };
    expect((await listPasskeys(context)).passkeys).toHaveLength(10);
    expect((await listPasskeys(context)).canRegister).toBe(false);
    const session = await createAppSession(subjectB, b, request(), { primaryAuthenticatedAt: new Date(), mfaAuthenticatedAt: new Date() });
    const active = await resolveAppSessionForApp(request({ [APP_SESSION_COOKIE]: session.token }), b);
    const registration = await startPasskeyRegistration(request(), context, active!.sessionId);
    expect(registration.ok).toBe(false);
    if (!registration.ok) expect(await registration.response.text()).toContain("passkey_limit_reached");
  });

  test("a weak B session requires strong proof after A enrolls shared TOTP", async () => {
    await getDb()`UPDATE app_user_passkeys SET removed_at = NOW() WHERE id = ${passkeyId}`;
    const weak = await createAppSession(subjectB, b, request(), { primaryAuthenticatedAt: new Date() });
    const active = await resolveAppSessionForApp(request({ [APP_SESSION_COOKIE]: weak.token }), b);
    const context = { realm: "app" as const, appId: b, appUserId: subjectB };
    expect(await requireFreshPasskeyChange(context, active!.sessionId)).toBeNull();
    await getDb()`INSERT INTO app_user_totp_factors (app_user_id, secret_ciphertext, confirmed_at) VALUES (${subjectA}, 'test-not-used', NOW())`;
    const blocked = await requireFreshPasskeyChange(context, active!.sessionId);
    expect(blocked?.status).toBe(403);
    expect(await blocked!.text()).toContain("passkey_step_up_required");
    const registration = await startPasskeyRegistration(request(), context, active!.sessionId);
    expect(registration.ok).toBe(false);
  });

  test("a valid repeated counter contains every subject of the Account", async () => {
    const source = await createAppSession(subjectA, a, request());
    const isolated = await createAppSession(outsideSubject, outside, request());
    expect((await prove(b, 1)).ok).toBe(true);
    expect((await prove(b, 1)).ok).toBe(false);
    expect(await resolveAppSessionForApp(request({ [APP_SESSION_COOKIE]: source.token }), a)).toBeNull();
    expect(await getDb()`SELECT id FROM app_user_sessions WHERE account_id = ${accountId} AND revoked_at IS NULL`).toHaveLength(0);
    expect(await resolveAppSessionForApp(request({ [APP_SESSION_COOKIE]: isolated.token }), outside)).not.toBeNull();
    const [registry] = await getDb()`SELECT active FROM passkey_credential_registry WHERE credential_id = ${credentialId}`;
    expect(registry.active).toBe(false);
  });
});
