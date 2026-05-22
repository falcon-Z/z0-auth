import type { ReactNode } from "react";

export type AppShellVariant = "auth" | "console";

type AppShellProps = {
  children: ReactNode;
  variant?: AppShellVariant;
};

/**
 * Root layout for every SPA entry: themed background and text even when children are empty or loading.
 */
export function AppShell({ children, variant = "auth" }: AppShellProps) {
  return (
    <div
      data-app-shell={variant}
      className={
        variant === "console"
          ? "min-h-screen flex flex-col bg-background text-foreground antialiased"
          : "min-h-screen bg-background text-foreground antialiased"
      }
    >
      {variant === "console" ? (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
