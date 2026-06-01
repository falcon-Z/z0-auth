import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import { Button } from "@z0/components/ui/button";
import { MetricCard } from "../../../components/dashboard/MetricCard";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { sessionHasPermission } from "../../../lib/tenant-permissions";
import type { SessionResponse } from "@z0/contracts/auth";
import { Link } from "react-router-dom";

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
  const canCreateTenant = sessionHasPermission(session, "tenants:create");
  const tenant = summary.tenant;

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tenant ? (
          <>
            <MetricCard label="Members" value={tenant.memberCount} to="/members" />
            {canInvite ? (
              <MetricCard label="Pending invites" value={tenant.pendingInviteCount} to="/members" />
            ) : null}
          </>
        ) : null}
        <MetricCard label="Your tenants" value={summary.membership.tenantCount} to="/tenants" />
        {summary.platform ? (
          <MetricCard label="Platform users" value={summary.platform.userCount} to="/users" />
        ) : null}
        <MetricCard label="Your sessions" value={summary.sessions.activeCount} to="/profile/sessions" />
      </div>

      <div className="flex flex-wrap gap-2">
        {tenant && canInvite ? (
          <Button asChild>
            <Link to="/members">Invite member</Link>
          </Button>
        ) : null}
        {canCreateTenant ? (
          <Button variant="outline" asChild>
            <Link to="/tenants/new">Create tenant</Link>
          </Button>
        ) : null}
        <Button variant="outline" asChild>
          <Link to="/profile">Your account</Link>
        </Button>
      </div>
    </div>
  );
}
