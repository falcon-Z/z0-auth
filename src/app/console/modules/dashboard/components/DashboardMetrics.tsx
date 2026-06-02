import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import { MetricCard } from "../../../components/dashboard/MetricCard";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { sessionHasPermission } from "../../../lib/tenant-permissions";
import type { SessionResponse } from "@z0/contracts/auth";
import { dashboardScopeForSession } from "../lib/dashboard-scopes";

type DashboardMetricsProps = {
  session: SessionResponse;
  summary: ConsoleSummaryResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

export function DashboardMetrics({ session, summary, loading, error, onRetry }: DashboardMetricsProps) {
  if (loading) return <ListPageSkeleton />;
  if (error || !summary) {
    return <PageError message={error ?? "Could not load dashboard."} onRetry={onRetry} />;
  }

  const scope = dashboardScopeForSession(session);

  if (scope === "tenant") {
    return <TenantMetricsSection session={session} summary={summary} />;
  }

  if (scope === "platform") {
    return <PlatformMetricsSection summary={summary} />;
  }

  return <EmptyState message="No dashboard metrics are available right now." />;
}

function TenantMetricsSection({
  session,
  summary,
}: {
  session: SessionResponse;
  summary: ConsoleSummaryResponse;
}) {
  const tenantMetrics = summary.tenant;
  const canInvite = sessionHasPermission(session, "users:invite");
  const tenantName = session.tenant?.name ?? tenantMetrics?.name;

  if (!tenantMetrics) {
    return (
      <EmptyState message="No tenant metrics are available with your current permissions." />
    );
  }

  return (
    <section className="space-y-3" aria-label={tenantName ? `${tenantName} overview` : "Tenant overview"}>
      {tenantName ? (
        <h2 className="text-sm font-medium text-muted-foreground">{tenantName}</h2>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Members" value={tenantMetrics.memberCount} to="/members" />
        {canInvite ? (
          <MetricCard label="Pending invites" value={tenantMetrics.pendingInviteCount} to="/members" />
        ) : null}
      </div>
    </section>
  );
}

function PlatformMetricsSection({ summary }: { summary: ConsoleSummaryResponse }) {
  const platform = summary.platform;
  const hasPlatformMetrics =
    platform && (platform.tenantCount !== undefined || platform.userCount !== undefined);

  if (!hasPlatformMetrics) {
    return (
      <EmptyState message="No platform metrics are available with your current permissions." />
    );
  }

  return (
    <section className="space-y-3" aria-label="Platform overview">
      <h2 className="text-sm font-medium text-muted-foreground">Platform</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {platform!.tenantCount !== undefined ? (
          <MetricCard label="Tenants" value={platform!.tenantCount} to="/tenants" />
        ) : null}
        {platform!.userCount !== undefined ? (
          <MetricCard label="Platform users" value={platform!.userCount} to="/users" />
        ) : null}
      </div>
    </section>
  );
}
