import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import { MetricCard } from "../../../components/dashboard/MetricCard";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { hasPlatformConsoleAccess } from "../../../lib/console-access";
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

  const activeTenant = session.tenant;
  const isTenantDashboard = Boolean(activeTenant);
  const isPlatformDashboard = !activeTenant && hasPlatformConsoleAccess(session);

  const platform = summary.platform;
  const tenantMetrics = summary.tenant;
  const canInvite = sessionHasPermission(session, "users:invite");

  if (isTenantDashboard) {
    if (!tenantMetrics) {
      return (
        <p className="text-sm text-muted-foreground">
          No tenant metrics are available with your current permissions.
        </p>
      );
    }

    return (
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{tenantMetrics.name}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Members" value={tenantMetrics.memberCount} to="/members" />
          {canInvite ? (
            <MetricCard label="Pending invites" value={tenantMetrics.pendingInviteCount} to="/members" />
          ) : null}
        </div>
      </section>
    );
  }

  if (isPlatformDashboard && platform) {
    const hasPlatformMetrics =
      platform.tenantCount !== undefined || platform.userCount !== undefined;

    if (!hasPlatformMetrics) {
      return (
        <p className="text-sm text-muted-foreground">
          No platform metrics are available with your current permissions.
        </p>
      );
    }

    return (
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Platform</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {platform.tenantCount !== undefined ? (
            <MetricCard label="Tenants" value={platform.tenantCount} to="/tenants" />
          ) : null}
          {platform.userCount !== undefined ? (
            <MetricCard label="Platform users" value={platform.userCount} to="/users" />
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">No dashboard metrics are available right now.</p>
  );
}
