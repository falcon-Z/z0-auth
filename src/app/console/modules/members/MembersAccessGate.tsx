import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { ListPageSkeleton } from "../../components/feedback/ListPageSkeleton";
import { useTenantPermissions } from "../../hooks/use-tenant-permissions";
import { useSession } from "../../context/session-context";

export function MembersAccessGate({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const { canReadMembers } = useTenantPermissions();

  if (!session.tenant?.id) {
    return (
      <Alert>
        <AlertTitle>No tenant</AlertTitle>
        <AlertDescription>Choose a tenant from the workspace menu.</AlertDescription>
      </Alert>
    );
  }

  if (!canReadMembers) {
    return (
      <Alert>
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>You cannot view members for this tenant.</AlertDescription>
      </Alert>
    );
  }

  return children;
}

export { ListPageSkeleton as MembersListSkeleton };
