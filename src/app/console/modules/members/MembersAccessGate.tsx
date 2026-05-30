import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Skeleton } from "@z0/components/ui/skeleton";
import { useTenantPermissions } from "../../hooks/use-tenant-permissions";
import { useSession } from "../../context/session-context";

export function MembersAccessGate({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const { canReadMembers } = useTenantPermissions();

  if (!session.tenant?.id) {
    return (
      <Alert>
        <AlertTitle>No tenant</AlertTitle>
        <AlertDescription>Select a tenant from the sidebar.</AlertDescription>
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

export function MembersListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
