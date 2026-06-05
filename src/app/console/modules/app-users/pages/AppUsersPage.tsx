import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { AppUserSummary, CreateAppUserInviteResponse, PendingAppUserInvite } from "@z0/contracts/app-users";
import type { AppDetail } from "@z0/contracts/apps";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { ResourceTabs } from "../../../components/crud/ResourceTabs";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { fetchApp } from "../../../lib/apps-api";
import {
  createAppUserInvite,
  fetchAppUserInvites,
  fetchAppUsers,
  patchAppUser,
  revokeAppUserInvite,
} from "../../../lib/app-users-api";
import { InviteFormDialog } from "../../members/components/InviteFormDialog";
import { CreateAppUserDialog } from "../components/CreateAppUserDialog";
import { AppUserInviteResultDialog } from "../components/AppUserInviteResultDialog";

export function AppUsersPage() {
  const { appId } = useParams<{ appId: string }>();
  const confirm = useConfirm();

  const [app, setApp] = useState<AppDetail | null>(null);
  const [users, setUsers] = useState<AppUserSummary[]>([]);
  const [invites, setInvites] = useState<PendingAppUserInvite[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"users" | "invites">("users");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreateAppUserInviteResponse | null>(null);

  const reload = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    try {
      const [appData, userList, inviteList] = await Promise.all([
        fetchApp(appId),
        fetchAppUsers(appId, search),
        fetchAppUserInvites(appId),
      ]);
      setApp(appData);
      setUsers(userList);
      setInvites(inviteList);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load app users.");
    } finally {
      setLoading(false);
    }
  }, [appId, search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleDisable(user: AppUserSummary) {
    if (!appId) return;
    const ok = await confirm({
      title: "Disable user",
      description: `${user.name} will not be able to sign in to this application.`,
      confirmLabel: "Disable",
      destructive: true,
    });
    if (!ok) return;

    setBusyId(user.userId);
    setNotice(null);
    try {
      await patchAppUser(appId, user.userId, { membershipStatus: "disabled" });
      setNotice(`${user.name} was disabled for this application.`);
      await reload();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not disable user.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleEnable(user: AppUserSummary) {
    if (!appId) return;
    setBusyId(user.userId);
    setNotice(null);
    try {
      await patchAppUser(appId, user.userId, { membershipStatus: "active" });
      setNotice(`${user.name} was re-enabled.`);
      await reload();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not enable user.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevokeInvite(invite: PendingAppUserInvite) {
    if (!appId) return;
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

  if (error || !app) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="App users" />
        <PageError message={error ?? "Application not found."} onRetry={() => void reload()} />
      </div>
    );
  }

  const tabs = [
    { id: "users", label: "Users" },
    { id: "invites", label: "Invites" },
  ];

  return (
    <div className="space-y-6">
      <ListPageHeader
        title={`App users — ${app.name}`}
        description="People who sign in to this application through your hosted auth."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/app-users">All applications</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/apps/${appId}`}>Application</Link>
            </Button>
            <Button variant="outline" onClick={() => setInviteOpen(true)}>
              Invite
            </Button>
            <Button onClick={() => setCreateOpen(true)}>Add user</Button>
          </>
        }
      />

      <ActionNotice message={notice} />

      <ResourceTabs tabs={tabs} activeId={tab} onChange={(id) => setTab(id as "users" | "invites")} />

      {tab === "users" ? (
        <div className="space-y-4">
          <Input
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <DataTable
            rowKey={(row) => row.userId}
            columns={[
              { id: "name", header: "Name", cell: (row) => row.name },
              { id: "email", header: "Email", cell: (row) => row.email },
              {
                id: "status",
                header: "Status",
                cell: (row) => (
                  <Badge variant={row.membershipStatus === "active" ? "secondary" : "outline"}>
                    {row.membershipStatus}
                  </Badge>
                ),
              },
              {
                id: "actions",
                header: "",
                cell: (row) =>
                  row.membershipStatus === "active" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyId === row.userId}
                      onClick={() => void handleDisable(row)}
                    >
                      Disable
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busyId === row.userId}
                      onClick={() => void handleEnable(row)}
                    >
                      Enable
                    </Button>
                  ),
              },
            ]}
            rows={users}
            emptyMessage="No app users yet. Add someone or send an invite."
          />
        </div>
      ) : (
        <DataTable
          rowKey={(row) => row.id}
          columns={[
            { id: "email", header: "Email", cell: (row) => row.email },
            { id: "name", header: "Name", cell: (row) => row.invitedName },
            {
              id: "actions",
              header: "",
              cell: (row) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busyId === row.id}
                  onClick={() => void handleRevokeInvite(row)}
                >
                  Revoke
                </Button>
              ),
            },
          ]}
          rows={invites}
          emptyMessage="No pending invitations."
        />
      )}

      {appId ? (
        <>
          <CreateAppUserDialog
            appId={appId}
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={() => void reload()}
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
        </>
      ) : null}
    </div>
  );
}
