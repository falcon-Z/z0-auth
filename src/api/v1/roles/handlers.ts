import type { BunRequest } from "bun";

import { requireSession } from "../../lib/auth";
import { json } from "../../lib/http";
import { listTenantRoles } from "../../lib/invites";

export async function handleListRoles(req: BunRequest): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "tenant";
  if (scope !== "tenant") {
    return json([]);
  }

  const roles = await listTenantRoles();
  return json(roles);
}
