import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { AppDetail } from "@z0/contracts/apps";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { EmptyState, EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useAppsData } from "../../../hooks/use-apps-data";
import { createApp } from "../../../lib/apps-api";
import { AppFormDialog } from "../components/AppFormDialog";

export function AppsListPage() {
  const navigate = useNavigate();
  const { apps, loading, error, reload } = useAppsData();
  const [createOpen, setCreateOpen] = useState(false);

  if (loading) return <ListPageSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="Applications" />
        <PageError message={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title="Applications"
        actions={<Button onClick={() => setCreateOpen(true)}>Register application</Button>}
      />

      {apps.length === 0 ? (
        <EmptyState
          message="No applications yet."
          action={
            <EmptyStateButton onClick={() => setCreateOpen(true)}>Register application</EmptyStateButton>
          }
        />
      ) : (
        <DataTable<AppDetail>
          columns={[
            {
              id: "name",
              header: "Name",
              accessorFn: (row) => row.name,
              cell: (row) => <span className="font-medium">{row.name}</span>,
            },
            {
              id: "slug",
              header: "Slug",
              accessorFn: (row) => row.slug,
              cell: (row) => <span className="font-mono text-xs">{row.slug}</span>,
            },
            {
              id: "status",
              header: "Status",
              accessorFn: (row) => row.status,
              cell: (row) => (
                <Badge variant={row.status === "active" ? "secondary" : "outline"}>{row.status}</Badge>
              ),
            },
            {
              id: "credentials",
              header: "Credentials",
              accessorFn: (row) => row.activeCredentialCount,
              cell: (row) => row.activeCredentialCount,
            },
          ]}
          rows={apps}
          rowKey={(row) => row.id}
          onRowClick={(row) => navigate(`/apps/${row.id}`)}
        />
      )}

      <AppFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={createApp}
        onSuccess={(app) => navigate(`/apps/${app.id}`)}
      />
    </div>
  );
}
