import type { SessionResponse } from "@z0/contracts/auth";

/** Signed-in instance member — full console access in v1. */
export function hasConsoleAccess(session: SessionResponse): boolean {
  return Boolean(session.authenticated && session.isInstanceMember);
}
