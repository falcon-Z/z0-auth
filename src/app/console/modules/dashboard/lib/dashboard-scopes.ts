import type { SessionResponse } from "@z0/contracts/auth";

import { hasConsoleAccess } from "../../../lib/console-access";

export type DashboardScope = "instance";

export function dashboardScopeForSession(session: SessionResponse): DashboardScope | null {
  return hasConsoleAccess(session) ? "instance" : null;
}
