import { useCallback, useEffect, useState } from "react";

import { useAppWorkspace } from "../../../context/app-workspace-context";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";

import type { AppCredentialSummary } from "@z0/contracts/apps";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import {
  createAppCredential,
  fetchAppCredentials,
  revokeAppCredential,
  rotateAppCredential,
} from "../../../lib/apps-api";
import { ApiError } from "../../../lib/api";
import { CredentialSecretDialog } from "../components/CredentialSecretDialog";

export function AppSetupPage() {
  const { appId, app, setNotice } = useAppWorkspace();
  const confirm = useConfirm();

  const [credentials, setCredentials] = useState<AppCredentialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [secretDialog, setSecretDialog] = useState<{
    clientId: string;
    clientSecret: string;
    title: string;
  } | null>(null);

  const reloadCredentials = useCallback(async () => {
    setLoading(true);
    try {
      setCredentials(await fetchAppCredentials(appId));
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not load credentials.");
    } finally {
      setLoading(false);
    }
  }, [appId, setNotice]);

  useEffect(() => {
    void reloadCredentials();
  }, [reloadCredentials]);

  usePageBreadcrumbs(
    [
      { label: "Apps", to: "/apps" },
      { label: app.name, to: `/apps/${appId}/setup` },
      { label: "Setup" },
    ],
    [app.name, appId],
  );

  async function handleCreateCredential() {
    if (app.status !== "active") return;
    setBusyId("create");
    setNotice(null);
    try {
      const result = await createAppCredential(appId);
      setSecretDialog({
        clientId: result.credential.clientId,
        clientSecret: result.clientSecret,
        title: "New client credential",
      });
      await reloadCredentials();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not create credential.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRotate(cred: AppCredentialSummary) {
    const ok = await confirm({
      title: "Rotate secret",
      description: "The current secret will stop working immediately.",
      confirmLabel: "Rotate",
      destructive: true,
    });
    if (!ok) return;

    setBusyId(cred.id);
    setNotice(null);
    try {
      const result = await rotateAppCredential(appId, cred.id);
      setSecretDialog({
        clientId: result.credential.clientId,
        clientSecret: result.clientSecret,
        title: "Secret rotated",
      });
      await reloadCredentials();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not rotate secret.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(cred: AppCredentialSummary) {
    const ok = await confirm({
      title: "Revoke credential",
      description: `Revoke ${cred.label} (${cred.clientId})?`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;

    setBusyId(cred.id);
    setNotice(null);
    try {
      await revokeAppCredential(appId, cred.id);
      setNotice("Credential revoked.");
      await reloadCredentials();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not revoke credential.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <ListPageSkeleton />;

  const activeCreds = credentials.filter((c) => c.status === "active");

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Redirect URIs</dt>
          <dd className="mt-1 space-y-1 font-mono text-xs">
            {app.redirectUris.map((uri) => (
              <div key={uri}>{uri}</div>
            ))}
          </dd>
        </div>
      </dl>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">Client credentials</h2>
          {app.status === "active" && credentials.length > 0 ? (
            <Button size="sm" disabled={busyId === "create"} onClick={() => void handleCreateCredential()}>
              Add credential
            </Button>
          ) : null}
        </div>

        <DataTable<AppCredentialSummary>
          columns={[
            { id: "label", header: "Label", accessorFn: (row) => row.label, cell: (row) => row.label },
            {
              id: "clientId",
              header: "Client ID",
              accessorFn: (row) => row.clientId,
              cell: (row) => <span className="font-mono text-xs">{row.clientId}</span>,
            },
            {
              id: "status",
              header: "Status",
              accessorFn: (row) => row.status,
              cell: (row) => (
                <Badge variant={row.status === "active" ? "secondary" : "outline"}>{row.status}</Badge>
              ),
            },
          ]}
          rows={credentials}
          rowKey={(row) => row.id}
          emptyMessage="No credentials yet."
          emptyAction={
            app.status === "active" ? (
              <Button
                type="button"
                disabled={busyId === "create"}
                onClick={() => void handleCreateCredential()}
              >
                Add credential
              </Button>
            ) : undefined
          }
          rowActions={(row) =>
            row.status === "active" ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyId === row.id || app.status !== "active"}
                  onClick={() => void handleRotate(row)}
                >
                  Rotate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyId === row.id || (app.status === "active" && activeCreds.length <= 1)}
                  onClick={() => void handleRevoke(row)}
                >
                  Revoke
                </Button>
              </div>
            ) : null
          }
        />
      </div>

      {secretDialog ? (
        <CredentialSecretDialog
          open
          clientId={secretDialog.clientId}
          clientSecret={secretDialog.clientSecret}
          title={secretDialog.title}
          onClose={() => setSecretDialog(null)}
        />
      ) : null}
    </div>
  );
}
