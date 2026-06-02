import type { SessionResponse } from "@z0/contracts/auth";

import { hasPlatformConsoleAccess } from "../../../lib/console-access";

export type DashboardScope = "tenant" | "platform";

/** One dashboard view at a time: active tenant wins over platform. */
export function dashboardScopeForSession(session: SessionResponse): DashboardScope | null {
  if (session.tenant?.id) return "tenant";
  if (hasPlatformConsoleAccess(session)) return "platform";
  return null;
}
