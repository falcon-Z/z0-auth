import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { closeDatabase, getDb } from "../../src/api/lib/db";
import { ensureApplicationSubject } from "../../src/api/lib/accounts";
import { linkFederationIdentity } from "../../src/api/lib/federation-linking";
import { createServiceGroup } from "../../src/api/lib/service-groups";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";

const run = hasTestDatabase() ? describe : describe.skip;
const profile = { subject: "upstream-person", email: "person@example.com", emailVerified: true,
  name: "Original profile", raw: { sub: "upstream-person" } };

async function application(slug: string) {
  const [row] = await getDb()`INSERT INTO apps (name, slug, client_type, redirect_uris)
    VALUES (${slug}, ${slug}, 'public', '{}') RETURNING id`;
  return String(row.id);
}
async function provider(key: string, issuer = "https://idp.example.com") {
  const [row] = await getDb()`INSERT INTO identity_providers (key, type, display_name, enabled, issuer)
    VALUES (${key}, 'custom', ${key}, TRUE, ${issuer}) RETURNING id`;
  return String(row.id);
}
async function membership(appId: string, accountId: string) {
  return getDb().begin(async tx => {
    const subject = await ensureApplicationSubject(tx, appId, accountId);
    if (!subject) throw new Error("Expected same-domain Account");
    await tx`INSERT INTO application_memberships (subject_id) VALUES (${subject})`;
    return subject;
  });
}

run("shared Account external identities", () => {
  beforeEach(resetTestDatabase);
  afterAll(closeDatabase);

  test("issuer+subject resolves the same Account through distinct target subjects without JIT membership", async () => {
    const a = await application("a"); const b = await application("b");
    const independent = await application("independent");
    expect((await createServiceGroup({ name: "shared", appIds: [a, b] })).ok).toBe(true);
    const providerA = await provider("provider-a"); const providerB = await provider("provider-b");
    const first = await linkFederationIdentity({ appId: a, providerId: providerA, profile });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected first sign-in");
    const [account] = await getDb()`SELECT account_id FROM app_users WHERE id = ${first.appUserId}`;
    await getDb()`UPDATE app_account_bindings SET metadata = '{"role":"private-to-a"}' WHERE id = ${first.appUserId}`;

    const missing = await linkFederationIdentity({ appId: b, providerId: providerB,
      profile: { ...profile, email: "upstream-changed@example.com", name: "Upstream changed" } });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.response.status).toBe(401);
    expect(await getDb()`SELECT id FROM accounts`).toHaveLength(1);
    expect(await getDb()`SELECT id FROM app_account_bindings WHERE app_id = ${b}`).toHaveLength(0);
    const targetSubject = await membership(b, String(account.account_id));
    const reused = await linkFederationIdentity({ appId: b, providerId: providerB,
      profile: { ...profile, email: "upstream-changed@example.com", name: "Upstream changed" } });
    expect(reused.ok && reused.appUserId).toBe(targetSubject);
    expect(reused.ok && reused.created).toBe(false);
    expect(targetSubject).not.toBe(first.appUserId);
    expect(await getDb()`SELECT id FROM app_user_identities`).toHaveLength(1);
    const [target] = await getDb()`SELECT account_id, name, email, metadata FROM app_users WHERE id = ${targetSubject}`;
    expect(String(target.account_id)).toBe(String(account.account_id));
    expect(target.name).toBe(profile.name); expect(target.email).toBe(profile.email);
    expect(target.metadata).toBeNull();

    await getDb()`UPDATE application_memberships SET status = 'disabled', disabled_at = NOW() WHERE subject_id = ${targetSubject}`;
    expect((await linkFederationIdentity({ appId: b, providerId: providerB, profile })).ok).toBe(false);
    await getDb()`DELETE FROM application_memberships WHERE subject_id = ${targetSubject}`;
    expect((await linkFederationIdentity({ appId: b, providerId: providerB, profile })).ok).toBe(false);
    expect(await getDb()`SELECT id FROM accounts`).toHaveLength(1);

    const separate = await linkFederationIdentity({ appId: independent, providerId: providerA, profile });
    expect(separate.ok).toBe(true);
    if (!separate.ok) throw new Error("Expected independent sign-in");
    const [other] = await getDb()`SELECT account_id FROM app_users WHERE id = ${separate.appUserId}`;
    expect(other.account_id).not.toBe(account.account_id);
    expect(await getDb()`SELECT id FROM accounts`).toHaveLength(2);
  });

  test("an unlinked shared Account cannot acquire target membership through matching verified email", async () => {
    const a = await application("a"); const b = await application("b");
    expect((await createServiceGroup({ name: "shared", appIds: [a, b] })).ok).toBe(true);
    const providerId = await provider("provider");
    const [original] = await getDb()`INSERT INTO app_users (app_id, email, name)
      VALUES (${a}, ${profile.email}, 'Local profile') RETURNING account_id`;
    const denied = await linkFederationIdentity({ appId: b, providerId, profile });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(401);
    expect(await getDb()`SELECT id FROM accounts`).toHaveLength(1);
    expect(await getDb()`SELECT id FROM app_user_identities`).toHaveLength(0);
    expect(await getDb()`SELECT id FROM app_account_bindings WHERE app_id = ${b}`).toHaveLength(0);
    const targetSubject = await membership(b, String(original.account_id));
    const linked = await linkFederationIdentity({ appId: b, providerId, profile });
    expect(linked.ok && linked.appUserId).toBe(targetSubject);
    expect(linked.ok && linked.created).toBe(false);
    expect(await getDb()`SELECT id FROM accounts`).toHaveLength(1);
  });
});
