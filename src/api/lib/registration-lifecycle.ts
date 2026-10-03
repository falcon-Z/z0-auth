import type { SQL } from "bun";
import type { AppDetail, OAuthClientSummary, RegistrationLifecycleRequest, RegistrationLifecycleResponse } from "@z0/contracts/apps";
import { randomToken, sha256Hex } from "./crypto";
import { getDb } from "./db";
import { loadConfig } from "./config";
import { containApplication, mapAppRow, type AppRow } from "./apps";
import { containClient, mapClient, type ClientRow } from "./oauth-clients";
import { contractResourceGrants, lockResourceAuthority } from "./oauth-resources";
import { problem } from "./http";
import { writeAuditEvent } from "./audit";

function fail(status: number, detail: string) {
  return { ok: false as const, response: problem(status, status === 404 ? "Not Found" : status === 409 ? "Conflict" : "Validation Error", detail) };
}
async function contain(tx: SQL, appId: string, clientId?: string) {
  if (clientId) return containClient(tx, clientId);
  await containApplication(tx, appId);
  await tx`UPDATE oauth_grants SET revoked_at = COALESCE(revoked_at, NOW()) WHERE app_id = ${appId}`;
  // Contain grants held by other clients to this Application's Resources too.
  await contractResourceGrants(tx);
}
async function purge(tx: SQL, app: AppRow & { account_domain_id: string }, clientId?: string) {
  if (clientId) {
    await tx`DELETE FROM oauth_clients WHERE id = ${clientId} AND app_id = ${app.id}`;
    return;
  }
  await tx`UPDATE oauth_resources SET status = 'retired', name = 'Retired resource', updated_at = NOW() WHERE app_id = ${app.id}`;
  await contractResourceGrants(tx);
  await tx`DELETE FROM client_resource_permissions WHERE resource_id IN (SELECT id FROM oauth_resources WHERE app_id = ${app.id})`;
  await tx`DELETE FROM oauth_resource_scopes WHERE app_id = ${app.id}`;
  await tx`UPDATE oauth_resources SET app_id = NULL WHERE app_id = ${app.id}`;
  // Cascades remove app-scoped subjects, memberships, metadata, sessions,
  // Clients and protocol state. Account-owned SSO authenticators survive.
  await tx`DELETE FROM apps WHERE id = ${app.id}`;
  const [domain] = await tx`SELECT kind FROM account_domains WHERE id = ${app.account_domain_id} FOR UPDATE`;
  if (domain?.kind === "independent") {
    await tx`DELETE FROM accounts WHERE account_domain_id = ${app.account_domain_id}`;
    await tx`DELETE FROM account_domains WHERE id = ${app.account_domain_id}`;
  }
}
export async function registrationLifecycle(input: {
  appId: string;
  clientId?: string;
  body: RegistrationLifecycleRequest;
  actorUserId: string;
  /** Verified session timestamp, supplied by the authenticated handler only. */
  verifiedAt: Date;
  sessionId: string;
  verificationHash?: string;
}): Promise<{ ok: true; data: RegistrationLifecycleResponse<AppDetail | OAuthClientSummary> } | { ok: false; response: Response }> {
  const { appId, clientId, body } = input;
  if (!body || !["delete", "restore", "purge"].includes(body.action) || Object.keys(body).some(k => !["action", "confirmation", "expectedGraceDays"].includes(k)))
    return fail(400, "Choose delete, restore or purge.");
  const graceDays = loadConfig().registrationDeletionGraceDays;
  if (body.action === "delete" && body.expectedGraceDays !== graceDays)
    return fail(409, "The deletion grace policy changed or was not confirmed. Review it before deleting.");
  return getDb().begin(async tx => {
    await lockResourceAuthority(tx, true);
    const [app] = await tx`SELECT * FROM apps WHERE id = ${appId} FOR UPDATE`;
    if (!app) return fail(404, "Application not found.");
    const [client] = clientId ? await tx`SELECT * FROM oauth_clients WHERE id = ${clientId} AND app_id = ${appId} FOR UPDATE` : [];
    if (clientId && !client) return fail(404, "Client not found.");
    const target = client ?? app;
    if (body.action !== "restore" && body.confirmation !== (client ? client.client_id : app.id))
      return fail(400, "Confirm the exact Application ID or Client ID.");
    const [session] = await tx`SELECT id FROM sessions WHERE id = ${input.sessionId} AND user_id = ${input.actorUserId}
      AND revoked_at IS NULL AND idle_expires_at > clock_timestamp() AND expires_at > clock_timestamp() FOR SHARE`;
    if (!session) return fail(401, "Authentication required.");
    if (body.action !== "restore") {
      const [proof] = await tx`SELECT * FROM registration_lifecycle_verifications
        WHERE token_hash = ${input.verificationHash ?? ""} AND actor_user_id = ${input.actorUserId}
          AND session_id = ${input.sessionId} AND app_id = ${appId}
          AND client_id IS NOT DISTINCT FROM ${clientId ?? null}::uuid AND action = ${body.action}
          AND grace_days IS NOT DISTINCT FROM ${body.action === "delete" ? body.expectedGraceDays! : null}::int
          AND consumed_at IS NULL AND expires_at > clock_timestamp() FOR UPDATE`;
      if (!proof || input.verifiedAt.getTime() <= new Date(proof.issued_at).getTime())
        return fail(403, "Fresh action-specific verification is required.");
      await tx`UPDATE registration_lifecycle_verifications SET consumed_at = clock_timestamp() WHERE token_hash = ${input.verificationHash!}`;
    }
    const [clock] = await tx`SELECT clock_timestamp() AS now`;
    const now = new Date(clock.now);
    if (input.verifiedAt.getTime() < now.getTime() - 10 * 60_000)
      return fail(403, "Verification expired while waiting. Verify again to continue.");
    const pending = target.status === "pending_deletion";
    if (body.action === "delete" && pending) return fail(409, "Deletion is already pending.");
    if (body.action !== "delete" && !pending) return fail(409, "Enter Pending Deletion first.");
    if (body.action === "restore" && new Date(target.purge_after) <= now)
      return fail(409, "The recovery period has expired.");
    if (body.action === "restore" && client && app.status !== "active")
      return fail(409, "Enable or restore the parent Application first.");
    if (body.action === "purge" && input.verifiedAt.getTime() <= new Date(target.deletion_started_at).getTime())
      return fail(403, "Verify again after entering Pending Deletion before permanently deleting.");
    let status: RegistrationLifecycleResponse<AppDetail>["status"];
    let registration: AppDetail | OAuthClientSummary | null = null;
    if (body.action === "purge") {
      await contain(tx, appId, clientId);
      await purge(tx, app, clientId);
      status = "purged";
    } else {
      const deadline = body.action === "delete" ? new Date(now.getTime() + graceDays * 86_400_000) : null;
      status = body.action === "delete" ? "pending_deletion" : "active";
      const [updated] = clientId
        ? await tx`UPDATE oauth_clients SET status = ${status}, deletion_started_at = ${deadline ? now : null}, purge_after = ${deadline}, disabled_at = NULL, updated_at = NOW() WHERE id = ${clientId} RETURNING *`
        : await tx`UPDATE apps SET status = ${status}, deletion_started_at = ${deadline ? now : null}, purge_after = ${deadline}, disabled_at = NULL, updated_at = NOW() WHERE id = ${appId} RETURNING *`;
      if (body.action === "delete") await contain(tx, appId, clientId);
      if (deadline && deadline.getTime() === now.getTime()) {
        // Zero grace is explicitly confirmed as irreversible in the console.
        await purge(tx, app, clientId);
        status = "purged";
      } else if (client) registration = mapClient(updated as ClientRow, app.minimum_assurance);
      else {
        const [count] = await tx`SELECT COUNT(*)::int AS count FROM oauth_clients WHERE app_id = ${appId} AND status = 'active'`;
        registration = mapAppRow(updated as AppRow, Number(count.count));
      }
    }
    await writeAuditEvent({ actorUserId: input.actorUserId, action: `${clientId ? "client" : "app"}.${body.action === "restore" ? "restored" : status === "purged" ? "purged" : "deletion_pending"}`, resourceType: clientId ? "oauth_client" : "app", resourceId: clientId ?? appId, payload: { appId, status } }, tx);
    return { ok: true as const, data: { status, registration } };
  });
}
/** Durable deadlines, coordinated by the same locks as issuance and recovery. */
export async function purgeExpiredRegistrations(): Promise<number> {
  return getDb().begin(async tx => {
    await lockResourceAuthority(tx, true);
    let count = 0;
    // Lock parent Applications first, including parents of due child Clients.
    const apps = await tx`SELECT * FROM apps WHERE
      (status = 'pending_deletion' AND purge_after <= clock_timestamp()) OR
      EXISTS (SELECT 1 FROM oauth_clients c WHERE c.app_id = apps.id AND c.status = 'pending_deletion' AND c.purge_after <= clock_timestamp())
      ORDER BY id FOR UPDATE`;
    for (const app of apps) {
      const [clock] = await tx`SELECT clock_timestamp() AS now`;
      if (app.status === "pending_deletion" && new Date(app.purge_after) <= new Date(clock.now)) {
        await contain(tx, app.id);
        await purge(tx, app);
        await writeAuditEvent({ action: "app.purged", resourceType: "app", resourceId: app.id, payload: { reason: "grace_expired" } }, tx);
        count++;
      } else {
        const clients = await tx`SELECT id FROM oauth_clients WHERE app_id = ${app.id} AND status = 'pending_deletion' AND purge_after <= clock_timestamp() ORDER BY id FOR UPDATE`;
        for (const c of clients) {
          await purge(tx, app, c.id);
          await writeAuditEvent({ action: "client.purged", resourceType: "oauth_client", resourceId: c.id, payload: { appId: app.id, reason: "grace_expired" } }, tx);
          count++;
        }
      }
    }
    return count;
  });
}

export async function prepareRegistrationVerification(input: {
  token: string | null; sessionId: string; actorUserId: string;
  appId: string; clientId?: string; action: "delete" | "purge"; graceDays?: number;
}): Promise<{ token: string; hash: string; issuedAt: Date } | null> {
  const db = getDb();
  if (input.token) {
    const hash = await sha256Hex(input.token);
    const [proof] = await db`SELECT issued_at FROM registration_lifecycle_verifications
      WHERE token_hash = ${hash} AND session_id = ${input.sessionId} AND actor_user_id = ${input.actorUserId}
        AND app_id = ${input.appId} AND client_id IS NOT DISTINCT FROM ${input.clientId ?? null}::uuid
        AND action = ${input.action} AND grace_days IS NOT DISTINCT FROM ${input.graceDays ?? null}::int AND consumed_at IS NULL AND expires_at > clock_timestamp()`;
    return proof ? { token: input.token, hash, issuedAt: new Date(proof.issued_at) } : null;
  }
  // Expired challenges are removed; no credential or identifying value in logs.
  await db`DELETE FROM registration_lifecycle_verifications WHERE expires_at <= clock_timestamp()`;
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  const [proof] = await db`INSERT INTO registration_lifecycle_verifications(token_hash, session_id, actor_user_id, app_id, client_id, action, grace_days)
    VALUES (${hash}, ${input.sessionId}, ${input.actorUserId}, ${input.appId}, ${input.clientId ?? null}, ${input.action}, ${input.graceDays ?? null}) RETURNING issued_at`;
  return { token, hash, issuedAt: new Date(proof.issued_at) };
}
