import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight } from "lucide-react";

import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { ConsolePage } from "../../../components/layout/ConsolePage";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { fetchConsoleSummary } from "../../../lib/console-summary-api";
import { ApiError } from "../../../lib/api";
import { formatRoleKey } from "../../../lib/tenant-permissions";
import { useSession } from "../../../context/session-context";

export function ProfileHomePage() {
  const { session, switchOrganization, switching, switchError } = useSession();
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

  const tenants = session.organizations ?? [];

  return (
    <ConsolePage title="Your account">
      {loading ? (
        <ListPageSkeleton />
      ) : error ? (
        <PageError message={error} onRetry={() => void reload()} />
      ) : (
        <div className="mx-auto max-w-2xl space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-medium">About you</h2>
            <dl className="grid gap-3 rounded-lg border px-4 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium text-right">{session.user.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="text-right">{session.user.email}</dd>
              </div>
              {(session.roles?.length ?? 0) > 0 ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <dt className="text-muted-foreground">Platform roles</dt>
                  <dd className="flex flex-wrap justify-end gap-1">
                    {session.roles!.map((role) => (
                      <Badge key={role} variant="secondary" className="capitalize">
                        {formatRoleKey(role)}
                      </Badge>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Tenants</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {summary?.membership.tenantCount ?? tenants.length}
              </span>
            </div>
            {tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground">You are not a member of any tenant.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {tenants.map((tenant) => {
                  const isActive = tenant.id === session.tenant?.id;
                  return (
                    <li key={tenant.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{tenant.name}</p>
                        {tenant.slug ? (
                          <p className="truncate text-xs text-muted-foreground">{tenant.slug}</p>
                        ) : null}
                      </div>
                      {isActive ? (
                        <Badge variant="secondary" className="shrink-0 gap-1">
                          <Check className="size-3" />
                          Active
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={switching}
                          onClick={() => {
                            void switchOrganization(tenant.id);
                          }}
                        >
                          Switch
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {switchError ? <p className="text-sm text-destructive">{switchError}</p> : null}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium">Security</h2>
            <div className="divide-y rounded-lg border">
              <Link
                to="/profile/security"
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40"
              >
                <span>
                  <span className="font-medium">Change password</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
              <Link
                to="/profile/sessions"
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40"
              >
                <span>
                  <span className="font-medium">Sessions</span>
                  {summary ? (
                    <span className="ml-2 text-muted-foreground tabular-nums">
                      {summary.sessions.activeCount} active
                    </span>
                  ) : null}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </div>
          </section>
        </div>
      )}
    </ConsolePage>
  );
}
