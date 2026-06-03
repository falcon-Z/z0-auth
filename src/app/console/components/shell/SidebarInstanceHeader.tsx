import { Building2 } from "lucide-react";

import { cn } from "../../lib/utils";

type SidebarInstanceHeaderProps = {
  organizationName?: string;
  className?: string;
};

export function SidebarInstanceHeader({ organizationName, className }: SidebarInstanceHeaderProps) {
  const name = organizationName?.trim();
  const hasName = Boolean(name);
  const initial = hasName ? name!.charAt(0).toUpperCase() : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/40 px-3 py-2.5 shadow-sm",
        className,
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md border border-sidebar-border/50",
          hasName
            ? "bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground"
            : "bg-sidebar-accent text-sidebar-foreground/40",
        )}
        aria-hidden
      >
        {initial ?? <Building2 className="size-4" strokeWidth={1.75} />}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
          Organization
        </p>
        <p
          className={cn(
            "truncate text-sm font-semibold",
            hasName ? "text-sidebar-foreground" : "text-sidebar-foreground/55",
          )}
        >
          {hasName ? name : "Not configured yet"}
        </p>
      </div>
    </div>
  );
}
