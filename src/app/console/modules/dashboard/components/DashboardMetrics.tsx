import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import { MetricCard } from "../../../components/dashboard/MetricCard";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { hasConsoleAccess } from "../../../lib/console-access";
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

  if (!hasConsoleAccess(session)) {
    return <EmptyState message="You do not have access to the console." />;
  }

  const { instance } = summary;
  const orgLabel = instance.organizationName || session.organizationName || "Your organization";

  return (
    <section className="space-y-3" aria-label={`${orgLabel} overview`}>
      <h2 className="text-sm font-medium text-muted-foreground">{orgLabel}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Team members" value={instance.memberCount} to="/members" />
        <MetricCard label="Pending invites" value={instance.pendingInviteCount} to="/members" />
        <MetricCard label="Users" value={instance.userCount} to="/users" />
        <MetricCard label="Your sessions" value={summary.sessions.activeCount} to="/profile/sessions" />
      </div>
    </section>
  );
}
