import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import { MetricCard } from "../../../components/dashboard/MetricCard";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { shouldShowTenantsNav } from "../../../lib/console-access";
import { sessionHasPermission } from "../../../lib/tenant-permissions";
import type { SessionResponse } from "@z0/contracts/auth";

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

  const canInvite = sessionHasPermission(session, "users:invite");
  const tenantsDirectory = shouldShowTenantsNav(session);
  const tenant = summary.tenant;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tenant ? (
        <>
          <MetricCard label="Members" value={tenant.memberCount} to="/members" />
          {canInvite ? (
            <MetricCard label="Pending invites" value={tenant.pendingInviteCount} to="/members" />
          ) : null}
        </>
      ) : null}
      <MetricCard
        label="Your tenants"
        value={summary.membership.tenantCount}
        to={tenantsDirectory ? "/tenants" : undefined}
      />
      {summary.platform ? (
        <MetricCard label="Platform users" value={summary.platform.userCount} to="/users" />
      ) : null}
    </div>
  );
}
