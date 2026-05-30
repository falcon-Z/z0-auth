import { useMemo } from "react";

import { useSession } from "../context/session-context";
import { sessionHasPermission, tenantPermissionsFromSession } from "../lib/tenant-permissions";

export function useTenantPermissions() {
  const { session } = useSession();

  return useMemo(
    () => ({
      permissions: tenantPermissionsFromSession(session),
      canReadMembers: sessionHasPermission(session, "users:read"),
      canInviteMembers: sessionHasPermission(session, "users:invite"),
      hasPermission: (key: string) => sessionHasPermission(session, key),
    }),
    [session],
  );
}
