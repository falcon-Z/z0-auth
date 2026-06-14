import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { CreateAppUserInviteResponse, PendingAppUserInvite } from "@z0/contracts/app-users";
import { Button } from "@z0/components/ui/button";
import { TabActions } from "../../../components/apps/TabActions";
import { DataTable } from "../../../components/crud/DataTable";
import { DestructiveButton } from "../../../components/forms/DestructiveButton";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useAppWorkspace } from "../../../context/app-workspace-context";
import { ApiError } from "../../../lib/api";
import { createAppUserInvite, fetchAppUserInvites, revokeAppUserInvite } from "../../../lib/app-users-api";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";
import { InviteFormDialog } from "../../members/components/InviteFormDialog";
import { AppUserInviteResultDialog } from "../components/AppUserInviteResultDialog";

export function AppUserInvitesPage() {
  const { appId, app, setNotice } = useAppWorkspace();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [invites, setInvites] = useState<PendingAppUserInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreateAppUserInviteResponse | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInvites(await fetchAppUserInvites(appId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load invitations.");
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchAppUserInvites(appId)
      .then((next) => {
        if (!cancelled) setInvites(next);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Could not load invitations.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appId]);

  usePageBreadcrumbs(
    [
      { label: "Apps", to: "/apps" },
      { label: app.name, to: `/apps/${appId}/setup` },
      { label: "Invites" },
    ],
    [app.name, appId],
  );

  async function handleRevokeInvite(invite: PendingAppUserInvite) {
    const ok = await confirm({
      title: "Revoke invitation",
      description: `Revoke the invitation for ${invite.email}?`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;

    setBusyId(invite.id);
    setNotice(null);
    try {
      await revokeAppUserInvite(appId, invite.id);
      setNotice("Invitation revoked.");
      await reload();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not revoke invitation.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error) {
    return <PageError message={error} onRetry={() => void reload()} />;
  }

  return (
    <div className="space-y-4">
      <TabActions>
        <Button onClick={() => setInviteOpen(true)}>Invite</Button>
      </TabActions>

      <DataTable
        rowKey={(row) => row.id}
        columns={[
          { id: "email", header: "Email", accessorFn: (row) => row.email, cell: (row) => row.email },
          { id: "name", header: "Name", accessorFn: (row) => row.invitedName, cell: (row) => row.invitedName },
          {
            id: "expires",
            header: "Expires",
            accessorFn: (row) => new Date(row.expiresAt).getTime(),
            cell: (row) => new Date(row.expiresAt).toLocaleDateString(),
          },
        ]}
        rows={invites}
        onRowClick={(row) => navigate(`/apps/${appId}/users/invites/${row.id}`)}
        emptyMessage="No pending invitations."
        emptyAction={<EmptyStateButton onClick={() => setInviteOpen(true)}>Invite</EmptyStateButton>}
        rowActions={(row) => (
          <DestructiveButton
            type="button"
            size="sm"
            disabled={busyId === row.id}
            onClick={() => void handleRevokeInvite(row)}
          >
            Revoke
          </DestructiveButton>
        )}
      />

      <InviteFormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSubmit={(body) => createAppUserInvite(appId, body)}
        onCreated={(result) => {
          setCreatedInvite(result);
          void reload();
        }}
      />
      <AppUserInviteResultDialog
        invite={createdInvite}
        appName={app.name}
        onClose={() => setCreatedInvite(null)}
      />
    </div>
  );
}
