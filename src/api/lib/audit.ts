import type { SQL } from "bun";

import { getDb } from "./db";

export async function writeAuditEvent(
  input: {
    tenantId?: string | null;
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
    INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, payload)
    VALUES (
      ${input.tenantId ?? null},
      ${input.actorUserId ?? null},
      ${input.action},
      ${input.resourceType},
      ${input.resourceId ?? null},
      ${JSON.stringify(input.payload ?? {})}
    )
  `;
}
