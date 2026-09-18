import type { SQL } from "bun";

import { getDb } from "./db";

export const AUDIT_RECORD_SCHEMA_VERSIONS = {
  "oauth.refresh_token_reuse_detected": 1,
} as const;

export type RefreshTokenReuseAuditRecord = {
  securityEventId: string;
  severity: "high";
  outcome: "family_revoked";
  appId: string;
  appUserId: string;
};

export async function writeAuditEvent(
  input: {
    actorUserId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string;
    payload?: Record<string, unknown>;
  },
  tx?: SQL,
): Promise<void> {
  const db = tx ?? getDb();
  await db`
    INSERT INTO audit_events (actor_user_id, action, resource_type, resource_id, payload)
    VALUES (
      ${input.actorUserId ? input.actorUserId : null},
      ${input.action},
      ${input.resourceType},
      ${input.resourceId ?? null},
      ${JSON.stringify(input.payload ?? {})}
    )
  `;
}

export async function writeRefreshTokenReuseAuditRecord(
  input: {
    familyId: string;
    appId: string;
    appUserId: string;
  },
  tx: SQL,
): Promise<void> {
  const payload: RefreshTokenReuseAuditRecord & { schemaVersion: 1 } = {
    schemaVersion: AUDIT_RECORD_SCHEMA_VERSIONS["oauth.refresh_token_reuse_detected"],
    securityEventId: crypto.randomUUID(),
    severity: "high",
    outcome: "family_revoked",
    appId: input.appId,
    appUserId: input.appUserId,
  };
  await writeAuditEvent({
    action: "oauth.refresh_token_reuse_detected",
    resourceType: "oauth_refresh_token_family",
    resourceId: input.familyId,
    payload,
  }, tx);
}
