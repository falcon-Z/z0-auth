import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { ListPageSkeleton } from "../../components/feedback/ListPageSkeleton";
import { sessionHasPermission } from "../../lib/tenant-permissions";
import { useSession } from "../../context/session-context";

export function UsersAccessGate({ children }: { children: ReactNode }) {
  const { session } = useSession();

  if (!sessionHasPermission(session, "platform:users:read")) {
    return (
      <Alert>
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>Platform administrator access is required.</AlertDescription>
      </Alert>
    );
  }

  return children;
}

export { ListPageSkeleton as UsersListSkeleton };
