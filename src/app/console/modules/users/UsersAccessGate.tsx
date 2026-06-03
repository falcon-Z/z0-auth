import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { ListPageSkeleton } from "../../components/feedback/ListPageSkeleton";
import { hasConsoleAccess } from "../../lib/console-access";
import { useSession } from "../../context/session-context";

export function UsersAccessGate({ children }: { children: ReactNode }) {
  const { session } = useSession();

  if (!hasConsoleAccess(session)) {
    return (
      <Alert>
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>You need to be a team member to view users.</AlertDescription>
      </Alert>
    );
  }

  return children;
}

export { ListPageSkeleton as UsersListSkeleton };
