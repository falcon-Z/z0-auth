import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@z0/components/ui/button";
import { ResourceTabs } from "../../../components/crud/ResourceTabs";
import { ConsolePage } from "../../../components/layout/ConsolePage";
import { PageError } from "../../../components/feedback/PageError";
import { fetchConsoleSummary } from "../../../lib/console-summary-api";
import { ApiError } from "../../../lib/api";
import { hasPlatformConsoleAccess, shouldShowTenantsNav } from "../../../lib/console-access";
import { useSession } from "../../../context/session-context";
import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import { DashboardMetrics } from "../components/DashboardMetrics";
import { dashboardScopeForSession } from "../lib/dashboard-scopes";

export function DashboardPage() {
  const { session } = useSession();
  const [summary, setSummary] = useState<ConsoleSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"tenant" | "platform">("tenant");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await fetchConsoleSummary());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, session.tenant?.id]);

  const description = useMemo(() => {
    const scope = view;
    if (scope === "tenant" && session.tenant?.name) {
      return `Metrics for ${session.tenant.name}.`;
    }
    if (scope === "platform") {
      return "Metrics across the entire platform.";
    }
    return undefined;
  }, [session, view]);

  const dashboardTabs = useMemo(() => {
    const tabs: Array<{ id: "tenant" | "platform"; label: string }> = [];
    if (summary?.tenant) tabs.push({ id: "tenant", label: "Tenant" });
    if (summary?.platform) tabs.push({ id: "platform", label: "Platform" });
    return tabs;
  }, [summary]);

  useEffect(() => {
    if (!summary) return;
    const scope = dashboardScopeForSession(session);
    const defaultView: "tenant" | "platform" = scope === "platform" ? "platform" : "tenant";
    const hasDefault = (defaultView === "tenant" && Boolean(summary.tenant)) || (defaultView === "platform" && Boolean(summary.platform));
    if (hasDefault) {
      setView(defaultView);
      return;
    }
    if (summary.tenant) {
      setView("tenant");
      return;
    }
    if (summary.platform) {
      setView("platform");
    }
  }, [summary, session]);

  const tenant = session.tenant;
  if (!tenant && !hasPlatformConsoleAccess(session)) {
    const canOpenTenants = shouldShowTenantsNav(session);

    return (
      <ConsolePage title="Dashboard">
        <PageError title="No tenant" message="You are not a member of any tenant yet.">
          {canOpenTenants ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/tenants">View tenants</Link>
            </Button>
          ) : null}
        </PageError>
      </ConsolePage>
    );
  }

  return (
    <ConsolePage title="Dashboard" description={description}>
      {dashboardTabs.length > 1 ? (
        <ResourceTabs
          tabs={dashboardTabs}
          activeId={view}
          onChange={(id) => setView(id as "tenant" | "platform")}
        />
      ) : null}
      <DashboardMetrics
        session={session}
        summary={summary}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        view={view}
      />
    </ConsolePage>
  );
}
