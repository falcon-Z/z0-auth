import type { BunRequest } from "bun";

import { requireInstanceMember } from "../../lib/instance-members";
import { buildConsoleSummary } from "../../lib/console-summary";
import { json } from "../../lib/http";

export async function handleConsoleSummary(req: BunRequest): Promise<Response> {
  const auth = await requireInstanceMember(req);
  if (!auth.ok) return auth.response;

  const summary = await buildConsoleSummary(auth.userId);
  return json(summary);
}
