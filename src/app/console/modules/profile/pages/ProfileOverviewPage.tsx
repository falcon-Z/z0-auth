import { useCallback, useEffect, useState } from "react";

import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import { Card, CardContent } from "@z0/components/ui/card";
import { MetricCard } from "../../../components/dashboard/MetricCard";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { fetchConsoleSummary } from "../../../lib/console-summary-api";
import { ApiError } from "../../../lib/api";
import { useSession } from "../../../context/session-context";

export function ProfileOverviewPage() {
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
      setError(e instanceof ApiError ? e.message : "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) return <ListPageSkeleton />;
  if (error) return <PageError message={error} onRetry={() => void reload()} />;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-medium">About you</h2>
        <Card>
          <CardContent className="py-4">
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="text-right font-medium">{session.user!.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="text-right">{session.user!.email}</dd>
              </div>
              {session.organizationName ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Organization</dt>
                  <dd className="text-right">{session.organizationName}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      </section>

      {summary ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Your activity</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Active sessions"
              value={summary.sessions.activeCount}
              to="/profile/sessions"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
