import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@z0/components/ui/button";
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
    const scope = dashboardScopeForSession(session);
    if (scope === "tenant" && session.tenant?.name) {
      return `Metrics for ${session.tenant.name}.`;
    }
    if (scope === "platform") {
      return "Metrics across the entire platform.";
    }
    return undefined;
  }, [session]);

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
      <DashboardMetrics
        session={session}
        summary={summary}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
      />
    </ConsolePage>
  );
}
