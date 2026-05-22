import type { BunRequest } from "bun";

import { buildSessionResponse, requireSession } from "../lib/auth";
import { json } from "../lib/http";
export async function handleGetMe(req: BunRequest): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const session = await buildSessionResponse(req);
  return json(session);
}

export const meRoutes = {
  "/api/v1/me": {
    GET: handleGetMe,
  },
} as const;
