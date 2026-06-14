import type { ReactNode } from "react";

/** Right-aligned actions row at the bottom of a form. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
}
