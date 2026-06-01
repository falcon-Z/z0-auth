import type { BunRequest } from "bun";

import { requireSession } from "../../lib/auth";
import { buildConsoleSummary } from "../../lib/console-summary";
import { json } from "../../lib/http";

export async function handleConsoleSummary(req: BunRequest): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  const summary = await buildConsoleSummary(auth.userId);
  return json(summary);
}
