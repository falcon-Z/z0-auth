import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { AppWorkspaceError, AppWorkspaceLayout } from "../../../components/apps/AppWorkspaceLayout";
import { TabActions } from "../../../components/apps/TabActions";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";

import type { AppScopeSummary } from "@z0/contracts/app-scopes";
import type { AppDetail } from "@z0/contracts/apps";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { fetchApp } from "../../../lib/apps-api";
import { ApiError } from "../../../lib/api";
import { deleteAppScope, fetchAppScopes } from "../../../lib/scopes-api";
import { ScopeFormDialog } from "../components/ScopeFormDialog";

export function AppScopesPage() {
  const { appId } = useParams<{ appId: string }>();
  const confirm = useConfirm();

  const [app, setApp] = useState<AppDetail | null>(null);
  const [scopes, setScopes] = useState<AppScopeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    try {
      const [appData, scopeList] = await Promise.all([fetchApp(appId), fetchAppScopes(appId)]);
      setApp(appData);
      setScopes(scopeList);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load scopes.");
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  usePageBreadcrumbs(
    app
      ? [
          { label: "Applications", to: "/apps" },
          { label: app.name, to: `/apps/${appId}` },
          { label: "Scopes" },
        ]
      : null,
    [app?.name, appId],
  );

  async function handleDelete(scope: AppScopeSummary) {
    if (!appId) return;
    const ok = await confirm({
      title: "Delete scope",
      description: `Remove ${scope.name}? Apps can no longer request this scope.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBusyId(scope.id);
    setNotice(null);
    try {
      await deleteAppScope(appId, scope.id);
      setNotice(`${scope.name} was removed.`);
      await reload();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not delete scope.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error || !app || !appId) {
    return <AppWorkspaceError message={error ?? "Application not found."} onRetry={() => void reload()} />;
  }

  return (
    <AppWorkspaceLayout appId={appId} app={app} notice={notice}>
      <TabActions>
        <Button onClick={() => setDialogOpen(true)}>Add scope</Button>
      </TabActions>

      <DataTable
        rowKey={(row) => row.id}
        columns={[
          { id: "name", header: "Scope", accessorFn: (row) => row.name, cell: (row) => <code>{row.name}</code> },
          {
            id: "description",
            header: "Description",
            accessorFn: (row) => row.description ?? "",
            cell: (row) => row.description ?? "—",
          },
        ]}
        rows={scopes}
        rowActions={(row) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busyId === row.id}
            onClick={() => void handleDelete(row)}
          >
            Delete
          </Button>
        )}
        emptyMessage="No scopes yet."
        emptyAction={
          <EmptyStateButton onClick={() => setDialogOpen(true)}>Add scope</EmptyStateButton>
        }
      />

      <ScopeFormDialog
        appId={appId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setNotice("Scope added.");
          void reload();
        }}
      />
    </AppWorkspaceLayout>
  );
}
