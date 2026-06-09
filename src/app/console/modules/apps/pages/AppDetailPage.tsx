import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { AppCredentialSummary, AppDetail } from "@z0/contracts/apps";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { EntityDetailLayout } from "../../../components/layout/EntityDetailLayout";
import { DataTable } from "../../../components/crud/DataTable";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import {
  createAppCredential,
  fetchApp,
  fetchAppCredentials,
  patchApp,
  revokeAppCredential,
  rotateAppCredential,
} from "../../../lib/apps-api";
import { ApiError } from "../../../lib/api";
import { AppFormDialog } from "../components/AppFormDialog";
import { CredentialSecretDialog } from "../components/CredentialSecretDialog";

export function AppDetailPage() {
  const { appId } = useParams<{ appId: string }>();
  const confirm = useConfirm();

  const [app, setApp] = useState<AppDetail | null>(null);
  const [credentials, setCredentials] = useState<AppCredentialSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [secretDialog, setSecretDialog] = useState<{
    clientId: string;
    clientSecret: string;
    title: string;
  } | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    try {
      const [appData, creds] = await Promise.all([fetchApp(appId), fetchAppCredentials(appId)]);
      setApp(appData);
      setCredentials(creds);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load application.");
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreateCredential() {
    if (!appId || app?.status !== "active") return;
    setBusyId("create");
    setNotice(null);
    try {
      const result = await createAppCredential(appId);
      setSecretDialog({
        clientId: result.credential.clientId,
        clientSecret: result.clientSecret,
        title: "New client credential",
      });
      await reload();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not create credential.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRotate(cred: AppCredentialSummary) {
    if (!appId) return;
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
      await reload();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not rotate secret.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(cred: AppCredentialSummary) {
    if (!appId) return;
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
      await reload();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not revoke credential.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleDisabled() {
    if (!appId || !app) return;
    const disabling = app.status === "active";
    const ok = await confirm({
      title: disabling ? "Disable application" : "Enable application",
      description: disabling
        ? "New credentials cannot be created while disabled."
        : "The application will be active again.",
      confirmLabel: disabling ? "Disable" : "Enable",
      destructive: disabling,
    });
    if (!ok) return;

    setBusyId("status");
    try {
      const updated = await patchApp(appId, { status: disabling ? "disabled" : "active" });
      setApp(updated);
      setNotice(disabling ? "Application disabled." : "Application enabled.");
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not update application.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !app) return <ListPageSkeleton />;

  if (error || !app) {
    return (
      <EntityDetailLayout backTo="/apps" backLabel="Applications" name="Application" tabs={[]}>
        <PageError title="Not found" message={error ?? "Application not found."}>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/apps">Back to applications</Link>
          </Button>
        </PageError>
      </EntityDetailLayout>
    );
  }

  const activeCreds = credentials.filter((c) => c.status === "active");

  return (
    <EntityDetailLayout
      backTo="/apps"
      backLabel="Applications"
      name={app.name}
      subtitle={app.slug}
      badges={
        <Badge variant={app.status === "active" ? "secondary" : "outline"}>{app.status}</Badge>
      }
      actions={
        <>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button variant="outline" disabled={busyId === "status"} onClick={() => void toggleDisabled()}>
            {app.status === "active" ? "Disable" : "Enable"}
          </Button>
        </>
      }
    >
      <ActionNotice message={notice} />

      <dl className="mb-8 grid gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Redirect URIs</dt>
          <dd className="mt-1 space-y-1 font-mono text-xs">
            {app.redirectUris.map((uri) => (
              <div key={uri}>{uri}</div>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Scopes</dt>
          <dd className="mt-1">
            <Button variant="link" className="h-auto p-0" asChild>
              <Link to={`/scopes/${appId}`}>Manage scopes</Link>
            </Button>
          </dd>
        </div>
      </dl>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">Client credentials</h2>
          {app.status === "active" ? (
            <Button size="sm" disabled={busyId === "create"} onClick={() => void handleCreateCredential()}>
              Add credential
            </Button>
          ) : null}
        </div>

        {credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credentials yet. Add one to integrate your app.</p>
        ) : (
          <DataTable<AppCredentialSummary>
            columns={[
              { id: "label", header: "Label", cell: (row) => row.label },
              {
                id: "clientId",
                header: "Client ID",
                cell: (row) => <span className="font-mono text-xs">{row.clientId}</span>,
              },
              {
                id: "status",
                header: "Status",
                cell: (row) => (
                  <Badge variant={row.status === "active" ? "secondary" : "outline"}>{row.status}</Badge>
                ),
              },
              {
                id: "actions",
                header: "",
                cell: (row) =>
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
                        disabled={
                          busyId === row.id ||
                          (app.status === "active" && activeCreds.length <= 1)
                        }
                        onClick={() => void handleRevoke(row)}
                      >
                        Revoke
                      </Button>
                    </div>
                  ) : null,
              },
            ]}
            rows={credentials}
            rowKey={(row) => row.id}
          />
        )}
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

      {app ? (
        <AppFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          mode="edit"
          initial={{ name: app.name, redirectUris: app.redirectUris }}
          onSubmit={(body) => patchApp(appId!, body)}
          onSuccess={(updated) => {
            setApp(updated);
            setNotice("Application updated.");
          }}
        />
      ) : null}
    </EntityDetailLayout>
  );
}
