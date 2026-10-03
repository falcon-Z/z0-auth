import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  CreateClientRequest,
  OAuthClientSummary,
  AppDetail,
} from "@z0/contracts/apps";
import { Button } from "@z0/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { useAppWorkspace } from "../../../context/app-workspace-context";
import { usePermissions } from "../../../hooks/use-permissions";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import {
  createAppClient,
  fetchAppClients,
  fetchRegistrationLifecyclePolicy,
  patchAppClient,
  rotateAppClientSecret,
} from "../../../lib/apps-api";
import { ClientResourcesDialog } from "../components/ClientResourcesDialog";
import { ClientFields, defaultClient } from "../components/ClientFields";
import { CredentialSecretDialog } from "../components/CredentialSecretDialog";

import { RegistrationLifecycleControls } from "../components/RegistrationLifecycleControls";

type Reveal = { clientId: string; clientSecret: string | null; title: string };
export function AppSetupPage() {
  const { appId, app, setApp, setNotice } = useAppWorkspace();
  const { hasScope } = usePermissions();
  const confirm = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const [resourceClient, setResourceClient] = useState<OAuthClientSummary | null>(null);
  const [clients, setClients] = useState<OAuthClientSummary[]>([]);
  const [graceDays, setGraceDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [editing, setEditing] = useState<OAuthClientSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultClient);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const [loaded, policy] = await Promise.all([fetchAppClients(appId), fetchRegistrationLifecyclePolicy()]);
      setClients(loaded);
      setGraceDays(policy.graceDays);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not load clients.");
    } finally {
      setLoading(false);
    }
  }, [appId, setNotice]);
  useEffect(() => {
    void reload();
  }, [reload, app.minimumAssurance]);
  useEffect(() => {
    const state = location.state as { credentialReveal?: Reveal } | null;
    if (state?.credentialReveal) {
      setReveal(state.credentialReveal);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);
  usePageBreadcrumbs(
    [
      { label: "Apps", to: "/apps" },
      { label: app.name, to: `/apps/${appId}/setup` },
      { label: "Setup" },
    ],
    [app.name, appId],
  );
  function edit(client: OAuthClientSummary | null) {
    setEditing(client);
    setValue(client ? { ...client } : defaultClient());
    setError(null);
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        const {
          label,
          redirectUris,
          browserOrigins,
          refreshEnabled,
          assuranceOverride,
        } = value;
        await patchAppClient(appId, editing.id, {
          label,
          redirectUris,
          browserOrigins,
          refreshEnabled,
          assuranceOverride,
        });
      } else {
        const result = await createAppClient(appId, value);
        setReveal({
          clientId: result.client.clientId,
          clientSecret: result.clientSecret,
          title: "New OAuth client",
        });
      }
      setOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save client.");
    } finally {
      setBusy(false);
    }
  }
  async function toggle(client: OAuthClientSummary) {
    const disable = client.status === "active";
    if (
      !(await confirm({
        title: disable ? "Disable client" : "Enable client",
        description: disable
          ? "New authorization and token issuance stop. Existing refresh authority will be revoked."
          : "New use will be allowed again.",
        confirmLabel: disable ? "Disable" : "Enable",
        destructive: disable,
      }))
    )
      return;
    setBusy(true);
    try {
      await patchAppClient(appId, client.id, {
        status: disable ? "disabled" : "active",
      });
      await reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update client.");
    } finally {
      setBusy(false);
    }
  }
  async function rotate(client: OAuthClientSummary) {
    if (
      !(await confirm({
        title: "Rotate secret",
        description: "The current secret will stop working immediately.",
        confirmLabel: "Rotate",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      const result = await rotateAppClientSecret(appId, client.id);
      setReveal({
        clientId: client.clientId,
        clientSecret: result.clientSecret,
        title: "Secret rotated",
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not rotate secret.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <ListPageSkeleton />;
  return (
    <div className="space-y-6">
      <p className="text-sm">
        Application minimum assurance: <strong>{app.minimumAssurance}</strong>.
        All clients share this application's membership and stable subjects.
      </p>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">OAuth clients</h2>
        {hasScope("apps.clients:create") && (
          <Button
            disabled={busy || app.status !== "active"}
            onClick={() => edit(null)}
          >
            Add client
          </Button>
        )}
      </div>
      <DataTable<OAuthClientSummary>
        columns={[
          {
            id: "label",
            header: "Label",
            accessorFn: (r) => r.label,
            cell: (r) => r.label,
          },
          {
            id: "id",
            header: "Client ID",
            accessorFn: (r) => r.clientId,
            cell: (r) => (
              <span className="font-mono text-xs">{r.clientId}</span>
            ),
          },
          {
            id: "type",
            header: "Class / purpose",
            accessorFn: (r) => `${r.clientType} ${r.purpose}`,
            cell: (r) => `${r.clientType} / ${r.purpose}`,
          },
          {
            id: "assurance",
            header: "Assurance",
            accessorFn: (r) => r.effectiveAssurance,
            cell: (r) =>
              r.purpose === "interactive" ? r.effectiveAssurance : "Workload",
          },
          {
            id: "status",
            header: "Status",
            accessorFn: (r) => r.status,
            cell: (r) => r.status,
          },
        ]}
        rows={clients}
        rowKey={(r) => r.id}
        emptyMessage="No clients."
        rowActions={(client) => (
          <div className="flex gap-2">
            {(hasScope("apps.clients:update") || hasScope("apps.clients:delete")) && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => edit(client)}
                >
                  Manage
                </Button>
                {hasScope("apps.clients:update") && <><Button size="sm" variant="outline" disabled={busy || client.status === "pending_deletion" || app.status === "pending_deletion"} onClick={() => setResourceClient(client)}>Resource access</Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || app.status !== "active" || client.status === "pending_deletion"}
                  onClick={() => void toggle(client)}
                >
                  {client.status === "active" ? "Disable" : "Enable"}
                </Button></>}
              </>
            )}
            {hasScope("apps.clients:rotate") &&
              client.clientType === "confidential" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    busy ||
                    client.status !== "active" ||
                    app.status !== "active"
                  }
                  onClick={() => void rotate(client)}
                >
                  Rotate secret
                </Button>
              )}
          </div>
        )}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={(e) => void save(e)}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Manage client" : "Add client"}
              </DialogTitle>
            </DialogHeader>
            {editing?.status !== "pending_deletion" && (!editing || hasScope("apps.clients:update")) && <div className="py-4">
              <ClientFields
                value={value}
                onChange={setValue}
                immutable={Boolean(editing)}
              />
            </div>}
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
              {editing?.status !== "pending_deletion" && (!editing || hasScope("apps.clients:update")) && <Button type="submit" disabled={busy || app.status === "pending_deletion"}>
                {busy ? "Saving…" : editing ? "Save" : "Create client"}
              </Button>}
            </DialogFooter>
          </form>
          {editing && hasScope("apps.clients:delete") && graceDays !== null && <RegistrationLifecycleControls
            appId={appId} app={app} client={editing} graceDays={graceDays}
            disabled={busy}
            onChanged={async () => { setOpen(false); await reload(); setNotice("Client lifecycle updated."); }}
            onError={setError}
          />}
        </DialogContent>
      </Dialog>
      {hasScope("apps:delete") && graceDays !== null && <RegistrationLifecycleControls
        appId={appId} app={app} graceDays={graceDays} disabled={busy}
        onChanged={async updated => {
          if (!updated) { navigate("/apps"); return; }
          setApp(updated as AppDetail);
          await reload();
          setNotice("Application lifecycle updated.");
        }}
        onError={setNotice}
      />}
      {resourceClient && <ClientResourcesDialog appId={appId} client={resourceClient} onClose={() => setResourceClient(null)} />}
      {reveal && (
        <CredentialSecretDialog
          open
          {...reveal}
          onClose={() => setReveal(null)}
        />
      )}
    </div>
  );
}
