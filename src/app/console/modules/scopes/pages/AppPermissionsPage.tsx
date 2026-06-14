import { useCallback, useEffect, useState } from "react";

import { TabActions } from "../../../components/apps/TabActions";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";

import type { AppScopeSummary } from "@z0/contracts/app-scopes";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { useAppWorkspace } from "../../../context/app-workspace-context";
import { ApiError } from "../../../lib/api";
import { deleteAppScope, fetchAppScopes } from "../../../lib/scopes-api";
import { ScopeFormDialog } from "../components/ScopeFormDialog";

export function AppPermissionsPage() {
  const { appId, app, setNotice } = useAppWorkspace();
  const confirm = useConfirm();

  const [scopes, setScopes] = useState<AppScopeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setScopes(await fetchAppScopes(appId));
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not load permissions.");
    } finally {
      setLoading(false);
    }
  }, [appId, setNotice]);

  useEffect(() => {
    void reload();
  }, [reload]);

  usePageBreadcrumbs(
    [
      { label: "Apps", to: "/apps" },
      { label: app.name, to: `/apps/${appId}/setup` },
      { label: "Permissions" },
    ],
    [app.name, appId],
  );

  async function handleDelete(scope: AppScopeSummary) {
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

  return (
    <>
      <TabActions>
        <Button onClick={() => setDialogOpen(true)}>Add scope</Button>
      </TabActions>

      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Scopes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What this app can ask for when someone signs in.
          </p>
        </div>

        <DataTable
          rowKey={(row) => row.id}
          columns={[
            { id: "name", header: "Scope", accessorFn: (row) => row.name, cell: (row) => <code>{row.name}</code> },
            {
              id: "description",
              header: "Description",
              accessorFn: (row) => row.description ?? "",
              cell: (row) => row.description ?? "None",
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
      </div>

      <div className="rounded-lg border px-4 py-6">
        <h2 className="text-sm font-medium">Custom roles</h2>
        <p className="mt-1 text-sm text-muted-foreground">Custom roles are not ready yet.</p>
      </div>

      <ScopeFormDialog
        appId={appId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setNotice("Scope added.");
          void reload();
        }}
      />
    </>
  );
}
