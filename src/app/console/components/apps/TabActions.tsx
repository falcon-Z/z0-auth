import type { ReactNode } from "react";

/** Right-aligned actions row inside a workspace tab panel. */
export function TabActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
}
