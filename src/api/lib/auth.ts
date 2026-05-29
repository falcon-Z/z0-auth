import type { BunRequest } from "bun";

import type { SessionResponse, SessionUser } from "@z0/contracts/auth";
import { getDb } from "./db";
import { problem } from "./http";
import { resolveSession } from "./session";
import { buildAuthenticatedSessionPayload } from "./session-payload";

export async function getUserById(userId: string): Promise<SessionUser | null> {
  const [row] = await getDb()`
    SELECT id, email, name FROM users WHERE id = ${userId} AND status = 'active'
  `;
  if (!row) return null;
  const r = row as { id: string; email: string; name: string };
  return { id: String(r.id), email: r.email, name: r.name };
}

export async function buildSessionResponse(req: Request): Promise<SessionResponse> {
  const session = await resolveSession(req);
  if (!session) return { authenticated: false };

  return buildAuthenticatedSessionPayload(session.userId);
}

export async function requireSession(req: BunRequest): Promise<
  | { ok: true; userId: string; sessionId: string }
  | { ok: false; response: Response }
> {
  const session = await resolveSession(req);
  if (!session) {
    return { ok: false, response: problem(401, "Unauthorized", "Authentication required") };
  }
  return { ok: true, userId: session.userId, sessionId: session.sessionId };
}
