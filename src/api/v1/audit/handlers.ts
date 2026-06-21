import type { RoutedRequest } from "../../lib/path-router";
import { json } from "../../lib/http";
import { requireScope } from "../../lib/platform-rbac";
import { listAuditEvents } from "../../lib/audit-query";

export async function handleListAuditEvents(req: RoutedRequest): Promise<Response> {
  const auth = await requireScope(req, "settings.audit:read");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  const result = await listAuditEvents({
    limit: Number.isFinite(limit) ? limit : undefined,
    before: url.searchParams.get("before") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    resourceType: url.searchParams.get("resourceType") ?? undefined,
  });

  return json(result);
}
