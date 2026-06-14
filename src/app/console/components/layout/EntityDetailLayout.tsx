import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

import { Avatar, AvatarFallback } from "@z0/components/ui/avatar";
import { Button } from "@z0/components/ui/button";
import { PageTabBar } from "../crud/PageTabBar";
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
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <div className="flex shrink-0 items-center gap-1">
            {backTo ? (
              <Button variant="ghost" size="icon" className="size-9 shrink-0" asChild>
                <Link to={backTo} aria-label={backLabel}>
                  <ChevronLeft className="size-5" />
                </Link>
              </Button>
            ) : null}
            <Avatar className="size-16 shrink-0 rounded-xl text-lg sm:size-20 sm:text-xl">
              <AvatarFallback className="rounded-xl bg-muted font-medium text-foreground">
                {initialsFromName(name)}
              </AvatarFallback>
            </Avatar>
          </div>
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

function resolveActiveRouteTabId(
  tabs: EntityDetailTab[],
  basePath: string,
  pathname: string,
): string {
  const baseMatch = tabs.find((tab) => {
    const path = tab.to ?? basePath;
    return path === basePath && pathname === basePath;
  });
  if (baseMatch) return baseMatch.id;

  let best: { tab: EntityDetailTab; path: string } | undefined;
  for (const tab of tabs) {
    const path = tab.to ?? basePath;
    if (path === basePath) continue;
    if (pathname === path || pathname.startsWith(`${path}/`)) {
      if (!best || path.length > best.path.length) {
        best = { tab, path };
      }
    }
  }

  return best?.tab.id ?? tabs[0]?.id ?? "";
}

function EntityDetailTabBar({
  tabs,
  basePath,
  useRouterTabs,
  activeTabId,
  onTabChange,
}: EntityDetailTabBarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  if (useRouterTabs) {
    const activeId = resolveActiveRouteTabId(tabs, basePath, location.pathname);

    return (
      <PageTabBar
        tabs={tabs}
        value={activeId}
        onValueChange={(id) => {
          const tab = tabs.find((item) => item.id === id);
          if (tab?.to) navigate(tab.to);
        }}
      />
    );
  }

  return (
    <PageTabBar
      tabs={tabs}
      value={activeTabId ?? tabs[0]?.id ?? ""}
      onValueChange={(id) => onTabChange?.(id)}
    />
  );
}
