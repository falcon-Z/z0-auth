import { useCallback, useEffect, useState } from "react";

import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Checkbox } from "@z0/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { Switch } from "@z0/components/ui/switch";
import type { ServiceGroupSummary } from "@z0/contracts/service-groups";

import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { EmptyState, EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { FormField } from "../../../components/forms/FormField";
import { FormActions } from "../../../components/forms/FormActions";
import { useAppsData } from "../../../hooks/use-apps-data";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import {
  createServiceGroup,
  deleteServiceGroup,
  fetchServiceGroup,
  fetchServiceGroups,
  patchServiceGroup,
  putServiceGroupApps,
} from "../../../lib/service-groups-api";

type EditorState = {
  mode: "create" | "edit";
  group?: ServiceGroupSummary;
};

export function AppGroupsPage() {
  const confirm = useConfirm();
  const { apps } = useAppsData();
  const [groups, setGroups] = useState<ServiceGroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const [name, setName] = useState("");
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchServiceGroups();
      setGroups(result.groups);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load app groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function openCreate() {
    setName("");
    setSsoEnabled(false);
    setSelectedAppIds([]);
    setFieldErrors({});
    setEditor({ mode: "create" });
  }

  async function openEdit(group: ServiceGroupSummary) {
    setFieldErrors({});
    setName(group.name);
    setSsoEnabled(group.ssoEnabled);
    setEditor({ mode: "edit", group });
    try {
      const detail = await fetchServiceGroup(group.id);
      setSelectedAppIds(detail.apps.map((app) => app.id));
    } catch {
      setSelectedAppIds([]);
    }
  }

  function toggleApp(appId: string, checked: boolean) {
    setSelectedAppIds((current) =>
      checked ? [...new Set([...current, appId])] : current.filter((id) => id !== appId),
    );
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setNotice(null);
    setFieldErrors({});
    try {
      if (editor.mode === "create") {
        await createServiceGroup({
          name,
          ssoEnabled,
          appIds: selectedAppIds,
        });
        setNotice("Group created.");
      } else if (editor.group) {
        await patchServiceGroup(editor.group.id, { name, ssoEnabled });
        await putServiceGroupApps(editor.group.id, { appIds: selectedAppIds });
        setNotice("Group updated.");
      }
      setEditor(null);
      await reload();
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.body));
        setNotice(e.message);
      } else {
        setNotice("Could not save group.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(group: ServiceGroupSummary) {
    const ok = await confirm({
      title: "Delete group",
      description: `Remove ${group.name}? Apps stay registered; only the grouping is removed.`,
      confirmLabel: "Delete group",
      destructive: true,
    });
    if (!ok) return;

    setSaving(true);
    setNotice(null);
    try {
      await deleteServiceGroup(group.id);
      setNotice("Group deleted.");
      await reload();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not delete group.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="App groups" backTo="/settings" backLabel="Back to settings" />
        <PageError message={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title="App groups"
        backTo="/settings"
        backLabel="Back to settings"
        actions={<Button onClick={openCreate}>Add group</Button>}
      />

      <ActionNotice message={notice} />

      {groups.length === 0 ? (
        <EmptyState
          message="No groups yet."
          action={<EmptyStateButton onClick={openCreate}>Add group</EmptyStateButton>}
        />
      ) : (
        <DataTable<ServiceGroupSummary>
          columns={[
            {
              id: "name",
              header: "Name",
              accessorFn: (row) => row.name,
              cell: (row) => <span className="font-medium">{row.name}</span>,
            },
            {
              id: "apps",
              header: "Apps",
              accessorFn: (row) => row.appCount,
              cell: (row) => row.appCount,
            },
            {
              id: "sso",
              header: "Shared sign-in",
              accessorFn: (row) => row.ssoEnabled,
              cell: (row) => (
                <Badge variant={row.ssoEnabled ? "secondary" : "outline"}>
                  {row.ssoEnabled ? "On" : "Off"}
                </Badge>
              ),
            },
            {
              id: "actions",
              header: "",
              accessorFn: (row) => row.id,
              cell: (row) => (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => void openEdit(row)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void handleDelete(row)} disabled={saving}>
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
          rows={groups}
          rowKey={(row) => row.id}
        />
      )}

      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editor?.mode === "create" ? "Add group" : "Edit group"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(event) => void handleSave(event)} className="space-y-4">
            <FormField label="Name" htmlFor="group-name" error={fieldErrors.name}>
              <Input
                id="group-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </FormField>

            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <Label htmlFor="group-sso">Shared sign-in</Label>
                <p className="text-sm text-muted-foreground">
                  Users signed in to one app can open sibling apps without signing in again.
                </p>
              </div>
              <Switch id="group-sso" checked={ssoEnabled} onCheckedChange={setSsoEnabled} />
            </div>

            <div className="space-y-2">
              <Label>Apps in this group</Label>
              {apps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Register an app first.</p>
              ) : (
                <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {apps.map((app) => (
                    <li key={app.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`app-${app.id}`}
                        checked={selectedAppIds.includes(app.id)}
                        onCheckedChange={(checked) => toggleApp(app.id, checked === true)}
                      />
                      <Label htmlFor={`app-${app.id}`} className="font-normal">
                        {app.name}
                      </Label>
                    </li>
                  ))}
                </ul>
              )}
              {fieldErrors.appIds ? (
                <p className="text-sm text-destructive">{fieldErrors.appIds}</p>
              ) : null}
            </div>

            <DialogFooter>
              <FormActions>
                <Button type="button" variant="outline" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : editor?.mode === "create" ? "Create group" : "Save changes"}
                </Button>
              </FormActions>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
