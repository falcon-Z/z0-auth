import type { ReactNode } from "react";

import { ListPageSkeleton } from "../../components/feedback/ListPageSkeleton";

export function MembersAccessGate({ children }: { children: ReactNode }) {
  return children;
}

export { ListPageSkeleton as MembersListSkeleton };
