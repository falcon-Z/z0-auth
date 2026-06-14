import type { ReactNode } from "react";

import type { AppDetail } from "@z0/contracts/apps";
import { Avatar, AvatarFallback } from "@z0/components/ui/avatar";
import { Badge } from "@z0/components/ui/badge";
import { ActionNotice } from "../feedback/ActionNotice";
import { PageError } from "../feedback/PageError";
import { EntityDetailLayout } from "../layout/EntityDetailLayout";
import { initialsFromName } from "../../lib/initials";
import { AppSectionSidebar } from "./AppSectionSidebar";

type AppWorkspaceLayoutProps = {
  appId: string;
  app: AppDetail;
  notice?: string | null;
  actions?: ReactNode;
  children: ReactNode;
};

/** Shared shell for app sections: header, sidebar nav, and content. */
export function AppWorkspaceLayout({
  appId,
  app,
  notice,
  actions,
  children,
}: AppWorkspaceLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="size-16 shrink-0 rounded-xl text-lg sm:size-20 sm:text-xl">
            <AvatarFallback className="rounded-xl bg-muted font-medium text-foreground">
              {initialsFromName(app.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1 pt-1">
            <h1 className="text-2xl font-semibold tracking-tight">{app.name}</h1>
            <p className="text-sm text-muted-foreground">{app.slug}</p>
            <div className="flex flex-wrap gap-1 pt-1">
              <Badge variant={app.status === "active" ? "secondary" : "outline"}>{app.status}</Badge>
            </div>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <AppSectionSidebar appId={appId} />
        <div className="min-w-0 flex-1 space-y-6">
          <ActionNotice message={notice ?? null} />
          {children}
        </div>
      </div>
    </div>
  );
}

type AppWorkspaceErrorProps = {
  message: string;
  onRetry?: () => void;
};

export function AppWorkspaceError({ message, onRetry }: AppWorkspaceErrorProps) {
  return (
    <EntityDetailLayout name="App">
      <PageError message={message} onRetry={onRetry} />
    </EntityDetailLayout>
  );
}
