import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import type { SessionResponse } from "@z0/contracts/auth";
import { Button } from "@z0/components/ui/button";
import { MetricCard } from "../../../components/dashboard/MetricCard";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { usePermissions } from "../../../hooks/use-permissions";
import { hasConsoleAccess } from "../../../lib/console-access";

type HomeViewProps = {
  session: SessionResponse;
  summary: ConsoleSummaryResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

export function HomeView({ session, summary, loading, error, onRetry }: HomeViewProps) {
  const { hasScope } = usePermissions();

  if (loading) return <ListPageSkeleton />;
  if (error || !summary) {
    return <PageError message={error ?? "Could not load home."} onRetry={onRetry} />;
  }

  if (!hasConsoleAccess(session)) {
    return <EmptyState message="You do not have access to the console." />;
  }

  const { instance } = summary;
  const canManageEmail = hasScope("settings.email:read");

  const nextSteps: { message: string; action: string; to: string }[] = [];

  if (instance.appCount === 0) {
    nextSteps.push({
      message: "Connect your first product when you're ready.",
      action: "Add an app",
      to: "/apps",
    });
  }

  if (!instance.emailReady && canManageEmail) {
    nextSteps.push({
      message: "Configure email to send invites and allow password resets.",
      action: "Set up email",
      to: "/settings/email",
    });
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4" aria-label="Overview">
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricCard label="Apps" value={instance.appCount} to="/apps" />
          <MetricCard label="Team" value={instance.memberCount} to="/team" />
        </div>
      </section>

      {nextSteps.length > 0 ? (
        <section className="space-y-3" aria-label="Next steps">
          <h2 className="text-sm font-medium">Next</h2>
          <ul className="space-y-3">
            {nextSteps.map((step) => (
              <li
                key={step.to}
                className="flex flex-col gap-3 rounded-lg border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-sm">{step.message}</p>
                <Button asChild size="sm" className="shrink-0">
                  <Link to={step.to}>{step.action}</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3" aria-label="Recent activity">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">Recent activity</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/activity">
              View all
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
        <div className="rounded-lg border px-4 py-8" aria-hidden />
      </section>
    </div>
  );
}
