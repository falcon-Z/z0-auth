import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { AppDetail } from "@z0/contracts/apps";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { RowActionLink } from "../../../components/crud/RowActionLink";
import { EmptyStateButton } from "../../../components/feedback/EmptyState";
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
        <EmptyStateButton
          message="No applications yet. Register one to get client credentials."
          actionLabel="Register application"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <DataTable<AppDetail>
          columns={[
            {
              id: "name",
              header: "Name",
              cell: (row) => <span className="font-medium">{row.name}</span>,
            },
            { id: "slug", header: "Slug", cell: (row) => <span className="font-mono text-xs">{row.slug}</span> },
            {
              id: "status",
              header: "Status",
              cell: (row) => (
                <Badge variant={row.status === "active" ? "secondary" : "outline"}>{row.status}</Badge>
              ),
            },
            {
              id: "credentials",
              header: "Credentials",
              cell: (row) => row.activeCredentialCount,
            },
            {
              id: "actions",
              header: "",
              cell: (row) => <RowActionLink to={`/apps/${row.id}`}>View</RowActionLink>,
            },
          ]}
          rows={apps}
          rowKey={(row) => row.id}
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
