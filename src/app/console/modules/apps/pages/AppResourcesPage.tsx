import { useCallback, useEffect, useState } from "react";
import type { ResourceSummary } from "@z0/contracts/resources";
import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@z0/components/ui/dialog";
import { useAppWorkspace } from "../../../context/app-workspace-context";
import { usePermissions } from "../../../hooks/use-permissions";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { DataTable } from "../../../components/crud/DataTable";
import { fetchAppScopes } from "../../../lib/scopes-api";
import {
  fetchResources,
  createResource,
  patchResource,
  retireResource,
} from "../../../lib/resources-api";

export function AppResourcesPage() {
  const { appId, app } = useAppWorkspace();
  const { hasScope } = usePermissions();
  const canReadScopes = hasScope("apps.scopes:read");
  const confirm = useConfirm();
  const [resources, setResources] = useState<ResourceSummary[]>([]);
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<ResourceSummary | null>(null);
  const [name, setName] = useState(""),
    [audience, setAudience] = useState(""),
    [scopes, setScopes] = useState<string[]>([]);
  const reload = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        fetchResources(appId),
        canReadScopes ? fetchAppScopes(appId) : Promise.resolve([]),
      ]);
      setResources(r);
      setVocabulary(s.map((s) => s.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load resources.");
    } finally {
      setLoading(false);
    }
  }, [appId, canReadScopes]);
  useEffect(() => {
    void reload();
  }, [reload]);
  usePageBreadcrumbs(
    [
      { label: "Apps", to: "/apps" },
      { label: app.name, to: `/apps/${appId}/setup` },
      { label: "Resources" },
    ],
    [appId, app.name],
  );
  function edit(resource: ResourceSummary | null) {
    setEditing(resource);
    setName(resource?.name ?? "");
    setAudience(resource?.audience ?? "");
    setScopes(resource?.scopes ?? []);
    setError(null);
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) await patchResource(appId, editing.id, { name, scopes });
      else await createResource(appId, { name, audience, scopes });
      setOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save resource.");
    } finally {
      setBusy(false);
    }
  }
  async function retire(resource: ResourceSummary) {
    if (
      !(await confirm({
        title: "Retire resource",
        description:
          "Clients will lose future issuance for this API. The audience stays reserved permanently. Existing renewable grants cannot be restored.",
        confirmLabel: "Retire",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await retireResource(appId, resource.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retire resource.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <ListPageSkeleton />;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Register each API with its own permanent audience. Expose scopes from
        the application's Permissions vocabulary, then allow individual clients
        to request them.
      </p>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">API resources</h2>
        {hasScope("apps.resources:manage") && (
          <Button onClick={() => edit(null)} disabled={busy}>
            Add resource
          </Button>
        )}
      </div>
      {error && !open && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DataTable<ResourceSummary>
        rows={resources}
        rowKey={(r) => r.id}
        emptyMessage="No resources registered."
        columns={[
          {
            id: "name",
            header: "Name",
            accessorFn: (r) => r.name,
            cell: (r) => r.name,
          },
          {
            id: "audience",
            header: "Audience",
            accessorFn: (r) => r.audience,
            cell: (r) => (
              <span className="break-all font-mono text-xs">{r.audience}</span>
            ),
          },
          {
            id: "scopes",
            header: "Scopes",
            accessorFn: (r) => r.scopes.join(" "),
            cell: (r) => r.scopes.join(", ") || "None",
          },
          {
            id: "status",
            header: "Status",
            accessorFn: (r) => r.status,
            cell: (r) => r.status,
          },
        ]}
        rowActions={(r) =>
          hasScope("apps.resources:manage") && r.status === "active" ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => edit(r)}
              >
                Edit resource
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void retire(r)}
              >
                Retire
              </Button>
            </div>
          ) : null
        }
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={(e) => void save(e)}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit resource" : "Add resource"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <label className="block text-sm">
                Resource name
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={128}
                />
              </label>
              <label className="block text-sm">
                Audience URI
                <Input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  required
                  disabled={Boolean(editing)}
                  placeholder="https://api.example.com/orders"
                />
              </label>
              <fieldset>
                <legend className="mb-2 text-sm">Exposed scopes</legend>
                {vocabulary.map((scope) => (
                  <label
                    key={scope}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={(e) =>
                        setScopes(
                          e.target.checked
                            ? [...scopes, scope]
                            : scopes.filter((s) => s !== scope),
                        )
                      }
                    />
                    {scope}
                  </label>
                ))}
              </fieldset>
              <p className="text-xs text-muted-foreground">
                Removing a scope contracts existing grants. Restoring it
                requires a new authorization to regain that authority.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save resource"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
