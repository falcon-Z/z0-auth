import type { SQL } from "bun";

import { getDb } from "./db";

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
