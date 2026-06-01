import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";

import type { ConsoleSummaryResponse } from "@z0/contracts/console-summary";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { fetchConsoleSummary } from "../../../lib/console-summary-api";
import { ApiError } from "../../../lib/api";
import { useSession } from "../../../context/session-context";

export function ProfileTenantsPage() {
  const { session, switchOrganization, switching, switchError } = useSession();
  const [summary, setSummary] = useState<ConsoleSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenants = session.organizations ?? [];

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await fetchConsoleSummary());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load tenants.");
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
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Switch the active tenant from here or the sidebar.
        </p>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
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
  );
}
