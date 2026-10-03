import type { SQL } from "bun";
import { timingSafeEqual } from "node:crypto";
import type { ClientSecretSummary, CreateClientSecretRequest, RevokeClientSecretRequest } from "@z0/contracts/apps";
import { getDb } from "./db";
import { randomToken, sha256Hex } from "./crypto";
import { verifyPassword } from "./password";
import { writeAuditEvent } from "./audit";
import { problem } from "./http";
import { lockResourceAuthority } from "./oauth-resources";

type SecretRow = {
  id: string; client_id: string; secret_digest: string; digest_algorithm: "sha256" | "argon2id";
  label: string | null; created_at: Date; created_by: string | null; expires_at: Date | null;
  last_used_at: Date | null; revoked_at: Date | null; revoked_by: string | null;
  revocation_reason: "ordinary" | "compromised" | null; expired: boolean;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(status: number, detail: string, extra?: Record<string, unknown>) {
  return { ok: false as const, response: problem(status, status === 404 ? "Not Found" : status === 409 ? "Conflict" : "Validation Error", detail, extra) };
}
function mapSecret(row: SecretRow): ClientSecretSummary {
  const iso = (d: Date | null) => d ? new Date(d).toISOString() : null;
  return { id: row.id, clientId: row.client_id, label: row.label, createdAt: iso(row.created_at)!, createdBy: row.created_by,
    status: row.revoked_at ? "revoked" : row.expired ? "expired" : "active", expiresAt: iso(row.expires_at),
    lastUsedAt: iso(row.last_used_at), revokedAt: iso(row.revoked_at), revokedBy: row.revoked_by, revocationReason: row.revocation_reason };
}
function isFutureExpiry(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return false;
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! && Number(parts[4]) < 24 &&
    Number(parts[5]) < 60 && Number(parts[6]) < 60 && Number(parts[7] ?? 0) < 24 && Number(parts[8] ?? 0) < 60 &&
    Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now();
}
export function validateSecretConfiguration(body: CreateClientSecretRequest) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !["label", "expiresAt", "replacementFor"].includes(k)))
    return fail(400, "Provide optional label, expiresAt and replacementFor only.");
  if (body.label !== undefined && body.label !== null && (typeof body.label !== "string" || !body.label.trim() || body.label.trim().length > 64))
    return fail(400, "Secret label must be 1 to 64 characters, or null.");
  if (body.expiresAt !== undefined && body.expiresAt !== null && !isFutureExpiry(body.expiresAt))
    return fail(400, "Secret expiry must be a future RFC 3339 timestamp, or null for no expiry.");
  if (body.replacementFor !== undefined && (typeof body.replacementFor !== "string" || !uuid.test(body.replacementFor)))
    return fail(400, "replacementFor must be a secret identifier belonging to this Client.");
  return { ok: true as const, value: { label: body.label?.trim() || null, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null } };
}
export async function insertClientSecret(tx: SQL, appId: string, clientId: string, actorUserId?: string, body: CreateClientSecretRequest = {}) {
  const id = crypto.randomUUID();
  const clientSecret = `z0_cs_${id}.${randomToken(32)}`;
  const digest = await sha256Hex(clientSecret);
  const [row] = await tx`INSERT INTO client_secrets(id, client_id, secret_digest, digest_algorithm, label, created_by, expires_at)
    VALUES (${id}, ${clientId}, ${digest}, 'sha256', ${body.label?.trim() || null}, ${actorUserId ?? null}, ${body.expiresAt ? new Date(body.expiresAt) : null})
    RETURNING *, expires_at <= clock_timestamp() AS expired`;
  await writeAuditEvent({ actorUserId, action: "client.secret_created", resourceType: "client_secret", resourceId: id,
    payload: { appId, clientId, replacementFor: body.replacementFor ?? null, expiresAt: body.expiresAt ?? null, outcome: "created" } }, tx);
  return { secret: mapSecret(row as SecretRow), clientSecret };
}
async function lockClient(tx: SQL, appId: string, id: string) {
  await lockResourceAuthority(tx, true);
  const [app] = await tx`SELECT status FROM apps WHERE id = ${appId} FOR UPDATE`;
  const [client] = await tx`SELECT client_type, status FROM oauth_clients WHERE id = ${id} AND app_id = ${appId} FOR UPDATE`;
  return app && client ? { app, client } : null;
}
export async function listClientSecrets(appId: string, id: string) {
  if (!uuid.test(appId) || !uuid.test(id)) return fail(404, "Client not found.");
  const [client] = await getDb()`SELECT id FROM oauth_clients WHERE id = ${id} AND app_id = ${appId}`;
  if (!client) return fail(404, "Client not found.");
  const rows = await getDb()`SELECT *, expires_at <= clock_timestamp() AS expired FROM client_secrets WHERE client_id = ${id} ORDER BY created_at, id`;
  return { ok: true as const, secrets: rows.map((r: SecretRow) => mapSecret(r)) };
}
export async function createClientSecret(appId: string, id: string, body: CreateClientSecretRequest, actorUserId?: string) {
  if (!uuid.test(appId) || !uuid.test(id)) return fail(404, "Client not found.");
  const validation = validateSecretConfiguration(body);
  if (!validation.ok) return validation;
  return getDb().begin(async tx => {
    const target = await lockClient(tx, appId, id);
    if (!target) return fail(404, "Client not found.");
    if (target.client.client_type !== "confidential") return fail(409, "Public clients do not use secrets.");
    if (target.app.status !== "active" || target.client.status !== "active") return fail(409, "Client and Application must be active to add a secret.");
    if (validation.value.expiresAt) {
      const [valid] = await tx`SELECT ${validation.value.expiresAt}::timestamptz > clock_timestamp() AS future`;
      if (!valid.future) return fail(400, "Secret expiry must be in the future.");
    }
    if (body.replacementFor) {
      const [replaced] = await tx`SELECT id FROM client_secrets WHERE id = ${body.replacementFor} AND client_id = ${id}`;
      if (!replaced) return fail(404, "Replacement secret does not belong to this Client.");
    }
    return { ok: true as const, data: await insertClientSecret(tx, appId, id, actorUserId, body) };
  });
}
export async function revokeClientSecret(appId: string, id: string, secretId: string, body: RevokeClientSecretRequest, actorUserId?: string) {
  if (!uuid.test(appId) || !uuid.test(id) || !uuid.test(secretId)) return fail(404, "Secret not found.");
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => k !== "reason") || !["ordinary", "compromised"].includes(body.reason))
    return fail(400, "Choose ordinary or compromised revocation.");
  return getDb().begin(async tx => {
    const target = await lockClient(tx, appId, id);
    if (!target) return fail(404, "Client not found.");
    const [secret] = await tx`SELECT *, expires_at <= clock_timestamp() AS expired FROM client_secrets WHERE id = ${secretId} AND client_id = ${id} FOR UPDATE`;
    if (!secret) return fail(404, "Secret not found.");
    if (secret.revoked_at) return { ok: true as const, secret: mapSecret(secret as SecretRow) };
    if (body.reason === "ordinary" && !secret.expired && target.app.status === "active" && target.client.status === "active") {
      const [other] = await tx`SELECT id FROM client_secrets WHERE client_id = ${id} AND id <> ${secretId}
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > clock_timestamp()) LIMIT 1`;
      if (!other) {
        await writeAuditEvent({ actorUserId, action: "client.secret_revocation_denied", resourceType: "client_secret", resourceId: secretId,
          payload: { appId, clientId: id, reason: "last_usable_secret", outcome: "denied" } }, tx);
        return fail(409, "This is the last usable secret. Revoking it would stop Client authentication and new token issuance. Create and deploy a replacement first; use compromised revocation for an emergency.", { code: "last_usable_secret" });
      }
    }
    const [revoked] = await tx`UPDATE client_secrets SET revoked_at = clock_timestamp(), revoked_by = ${actorUserId ?? null}, revocation_reason = ${body.reason}
      WHERE id = ${secretId} RETURNING *, expires_at <= clock_timestamp() AS expired`;
    await writeAuditEvent({ actorUserId, action: "client.secret_revoked", resourceType: "client_secret", resourceId: secretId,
      payload: { appId, clientId: id, reason: body.reason, outcome: "revoked" } }, tx);
    return { ok: true as const, secret: mapSecret(revoked as SecretRow) };
  });
}
// Call while holding the same Application/Client locks used by issuance and revocation.
export async function secretStillUsable(tx: SQL, clientId: string, secretId: string): Promise<boolean> {
  const [row] = await tx`SELECT id FROM client_secrets WHERE id = ${secretId} AND client_id = ${clientId}
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > clock_timestamp()) FOR SHARE`;
  return Boolean(row);
}
export async function authenticateClientSecret(client: { credentialId: string; appId: string; clientType: string; authenticatedSecretId?: string }, value: string | undefined): Promise<boolean> {
  delete client.authenticatedSecretId;
  if (client.clientType === "public") return value === undefined;
  if (!value || value.length > 512) return false;
  const match = /^z0_cs_([0-9a-f-]{36})\.[0-9a-f]{64}$/.exec(value);
  const lookup = match && uuid.test(match[1]!) ? match[1]! : null;
  const rows = lookup
    ? await getDb()`SELECT * FROM client_secrets WHERE id = ${lookup} AND client_id = ${client.credentialId} AND digest_algorithm = 'sha256' AND revoked_at IS NULL`
    : await getDb()`SELECT * FROM client_secrets WHERE client_id = ${client.credentialId} AND digest_algorithm = 'argon2id' AND revoked_at IS NULL`;
  for (const row of rows as SecretRow[]) {
    const actual = row.digest_algorithm === "sha256" ? await sha256Hex(value) : null;
    const valid = actual !== null
      ? actual.length === row.secret_digest.length && timingSafeEqual(Buffer.from(actual), Buffer.from(row.secret_digest))
      : await verifyPassword(value, row.secret_digest).catch(() => false);
    if (!valid) continue;
    const accepted = await getDb().begin(async tx => {
      await lockResourceAuthority(tx);
      const [app] = await tx`SELECT status FROM apps WHERE id = ${client.appId} FOR SHARE`;
      const [current] = await tx`SELECT status, client_type FROM oauth_clients WHERE id = ${client.credentialId} AND app_id = ${client.appId} FOR SHARE`;
      if (app?.status !== "active" || current?.status !== "active" || current.client_type !== "confidential") return false;
      const [used] = await tx`UPDATE client_secrets SET last_used_at = clock_timestamp() WHERE id = ${row.id} AND client_id = ${client.credentialId}
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > clock_timestamp()) RETURNING id`;
      return Boolean(used);
    });
    if (accepted) client.authenticatedSecretId = row.id;
    return accepted;
  }
  return false;
}
