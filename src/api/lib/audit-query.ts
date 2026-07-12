import type { AuditEventSummary } from "@z0/contracts/audit";

import { getDb } from "./db";

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload: Record<string, unknown> | string;
  created_at: Date;
};

function mapRow(row: AuditRow): AuditEventSummary {
  const payload =
    typeof row.payload === "string"
      ? (JSON.parse(row.payload) as Record<string, unknown>)
      : (row.payload ?? {});

  return {
    id: String(row.id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    payload,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listAuditEvents(options: {
  limit?: number;
  before?: string;
  action?: string;
  resourceType?: string;
}): Promise<{ events: AuditEventSummary[]; hasMore: boolean; nextCursor: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const fetchLimit = limit + 1;

  let beforeDate: Date | null = null;
  let beforeId: string | null = null;
  if (options.before) {
    try {
      const decoded = JSON.parse(Buffer.from(options.before, "base64url").toString("utf8")) as {
        createdAt?: string;
        id?: string;
      };
      const parsedDate = new Date(decoded.createdAt ?? "");
      if (!Number.isNaN(parsedDate.getTime()) && decoded.id) {
        beforeDate = parsedDate;
        beforeId = decoded.id;
      }
    } catch {
      // Invalid cursors deliberately yield the first page; input validation is handled by the API layer.
    }
  }

  const actionFilter = options.action?.trim() || null;
  const resourceTypeFilter = options.resourceType?.trim() || null;

  const rows = await getDb()`
    SELECT
      e.id,
      e.actor_user_id,
      u.name AS actor_name,
      u.email AS actor_email,
      e.action,
      e.resource_type,
      e.resource_id,
      e.payload,
      e.created_at
    FROM audit_events e
    LEFT JOIN users u ON u.id = e.actor_user_id
    WHERE (
      ${beforeDate}::timestamptz IS NULL
      OR (e.created_at, e.id) < (${beforeDate}, ${beforeId}::uuid)
    )
      AND (${actionFilter}::text IS NULL OR e.action = ${actionFilter})
      AND (${resourceTypeFilter}::text IS NULL OR e.resource_type = ${resourceTypeFilter})
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ${fetchLimit}
  `;

  const mapped = (rows as AuditRow[]).map(mapRow);
  const hasMore = mapped.length > limit;
  const events = mapped.slice(0, limit);
  const last = events.at(-1);
  const nextCursor = hasMore && last
    ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString("base64url")
    : null;
  return { events, hasMore, nextCursor };
}
