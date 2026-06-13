import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { AppSummary } from "@z0/contracts/apps";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { EmptyState } from "../../../components/feedback/EmptyState";
import { fetchApps } from "../../../lib/apps-api";
import { ApiError } from "../../../lib/api";

export function AppUsersPickerPage() {
  const navigate = useNavigate();
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApps(await fetchApps());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) return <ListPageSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="App users" />
        <PageError message={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ListPageHeader title="App users" />

      {apps.length === 0 ? (
        <EmptyState
          message="No applications yet. Register one before adding app users."
          action={
            <Button asChild>
              <Link to="/apps">Go to applications</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          rowKey={(row) => row.id}
          columns={[
            { id: "name", header: "Application", cell: (row) => row.name },
            { id: "slug", header: "Slug", cell: (row) => row.slug },
          ]}
          rows={apps}
          onRowClick={(row) => navigate(`/app-users/${row.id}`)}
        />
      )}
    </div>
  );
}
