import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import { MetricCard } from "../../../components/dashboard/MetricCard";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { hasPlatformConsoleAccess, shouldShowTenantsNav } from "../../../lib/console-access";
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

  const platform = summary.platform;
  const tenant = summary.tenant;
  const showPlatform = hasPlatformConsoleAccess(session) && platform;
  const canReadMembers = sessionHasPermission(session, "users:read");
  const canInvite = sessionHasPermission(session, "users:invite");
  const tenantsDirectory = shouldShowTenantsNav(session);

  return (
    <div className="space-y-6">
      {showPlatform ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Platform</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {platform.tenantCount !== undefined ? (
              <MetricCard label="Organizations" value={platform.tenantCount} to="/tenants" />
            ) : null}
            {platform.userCount !== undefined ? (
              <MetricCard label="Platform users" value={platform.userCount} to="/users" />
            ) : null}
          </div>
        </section>
      ) : null}

      {tenant && canReadMembers ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {tenant.name}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Members" value={tenant.memberCount} to="/members" />
            {canInvite ? (
              <MetricCard label="Pending invites" value={tenant.pendingInviteCount} to="/members" />
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Your account</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Your organizations"
            value={summary.membership.tenantCount}
            to={tenantsDirectory ? "/tenants" : undefined}
          />
          <MetricCard label="Active sessions" value={summary.sessions.activeCount} to="/profile/sessions" />
        </div>
      </section>
    </div>
  );
}
