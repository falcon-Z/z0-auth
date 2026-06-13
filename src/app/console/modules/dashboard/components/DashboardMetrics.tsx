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

  return (
    <section aria-label="Overview">
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="Members" value={instance.memberCount} to="/members" />
        <MetricCard label="Applications" value={instance.appCount} to="/apps" />
        <MetricCard label="Pending invites" value={instance.pendingInviteCount} to="/members" />
        <MetricCard label="Sessions" value={summary.sessions.activeCount} to="/profile/sessions" />
      </div>
    </section>
  );
}
