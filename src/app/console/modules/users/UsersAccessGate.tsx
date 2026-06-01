import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Skeleton } from "@z0/components/ui/skeleton";
import { useSession } from "../../context/session-context";
import { sessionHasPermission } from "../../lib/tenant-permissions";

export function UsersAccessGate({ children }: { children: ReactNode }) {
  const { session } = useSession();

  if (!sessionHasPermission(session, "platform:users:read")) {
    return (
      <Alert>
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>You need platform administrator access to manage users.</AlertDescription>
      </Alert>
    );
  }

  return children;
}

export function UsersListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
