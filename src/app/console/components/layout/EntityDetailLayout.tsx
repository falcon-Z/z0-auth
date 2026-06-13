import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

import { Avatar, AvatarFallback } from "@z0/components/ui/avatar";
import { Button } from "@z0/components/ui/button";
import { cn } from "../../lib/utils";
import { initialsFromName } from "../../lib/initials";

export type EntityDetailTab = {
  id: string;
  label: string;
  /** When set, tab navigates via router. Omit for in-page controlled tabs. */
  to?: string;
};

type EntityDetailLayoutProps = {
  backTo?: string;
  backLabel?: string;
  name: string;
  subtitle?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  tabs?: EntityDetailTab[];
  /** Base path for route tabs (e.g. `/profile`). Used to pick the active tab from the URL. */
  basePath?: string;
  /** Controlled tab id when tabs have no `to`. */
  activeTabId?: string;
  onTabChange?: (id: string) => void;
  children: ReactNode;
  className?: string;
};

export function EntityDetailLayout({
  backTo,
  backLabel = "Back",
  name,
  subtitle,
  badges,
  actions,
  tabs,
  basePath = "",
  activeTabId,
  onTabChange,
  children,
  className,
}: EntityDetailLayoutProps) {
  const useRouterTabs = tabs?.some((t) => t.to) ?? false;

  return (
    <div className={cn("space-y-6", className)}>
      {backTo ? (
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link to={backTo}>
            <ChevronLeft className="size-4" />
            {backLabel}
          </Link>
        </Button>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="size-16 shrink-0 rounded-xl text-lg sm:size-20 sm:text-xl">
            <AvatarFallback className="rounded-xl bg-muted font-medium text-foreground">
              {initialsFromName(name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1 pt-1">
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
            {badges ? <div className="flex flex-wrap gap-1 pt-1">{badges}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>

      {tabs && tabs.length > 1 ? (
        <EntityDetailTabBar
          tabs={tabs}
          basePath={basePath}
          useRouterTabs={useRouterTabs}
          activeTabId={activeTabId}
          onTabChange={onTabChange}
        />
      ) : null}

      <div>{children}</div>
    </div>
  );
}

type EntityDetailTabBarProps = {
  tabs: EntityDetailTab[];
  basePath: string;
  useRouterTabs: boolean;
  activeTabId?: string;
  onTabChange?: (id: string) => void;
};

function EntityDetailTabBar({
  tabs,
  basePath,
  useRouterTabs,
  activeTabId,
  onTabChange,
}: EntityDetailTabBarProps) {
  if (useRouterTabs) {
    return (
      <div className="flex gap-1 overflow-x-auto border-b" role="tablist">
        {tabs.map((tab) => {
          const to = tab.to ?? basePath;
          return (
            <NavLink
              key={tab.id}
              to={to}
              end={to === basePath}
              role="tab"
              className={({ isActive }) =>
                cn(
                  "shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors -mb-px",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )
              }
            >
              {tab.label}
            </NavLink>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex gap-1 overflow-x-auto border-b" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTabId === tab.id}
          className={cn(
            "shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors -mb-px",
            activeTabId === tab.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onTabChange?.(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
