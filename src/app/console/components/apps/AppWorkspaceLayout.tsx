import type { ReactNode } from "react";
import { useMemo } from "react";

import type { AppDetail } from "@z0/contracts/apps";
import { Badge } from "@z0/components/ui/badge";
import { EntityDetailLayout, type EntityDetailTab } from "../layout/EntityDetailLayout";
import { ActionNotice } from "../feedback/ActionNotice";
import { PageError } from "../feedback/PageError";

export function appSectionTabs(appId: string): EntityDetailTab[] {
  return [
    { id: "overview", label: "Overview", to: `/apps/${appId}` },
    { id: "scopes", label: "Scopes", to: `/apps/${appId}/scopes` },
    { id: "users", label: "Users", to: `/apps/${appId}/users` },
  ];
}

type AppWorkspaceLayoutProps = {
  appId: string;
  app: AppDetail;
  notice?: string | null;
  children: ReactNode;
};

/** Shared shell for application Overview, Scopes, and Users pages. */
export function AppWorkspaceLayout({
  appId,
  app,
  notice,
  children,
}: AppWorkspaceLayoutProps) {
  const tabs = useMemo(() => appSectionTabs(appId), [appId]);

  return (
    <EntityDetailLayout
      name={app.name}
      subtitle={app.slug}
      basePath={`/apps/${appId}`}
      tabs={tabs}
      badges={
        <Badge variant={app.status === "active" ? "secondary" : "outline"}>{app.status}</Badge>
      }
    >
      <div className="space-y-6">
        <ActionNotice message={notice ?? null} />
        {children}
      </div>
    </EntityDetailLayout>
  );
}

type AppWorkspaceErrorProps = {
  message: string;
  onRetry?: () => void;
};

export function AppWorkspaceError({ message, onRetry }: AppWorkspaceErrorProps) {
  return (
    <EntityDetailLayout name="Application">
      <PageError message={message} onRetry={onRetry} />
    </EntityDetailLayout>
  );
}
