import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { AppUserSummary, CreateAppUserInviteResponse, PendingAppUserInvite } from "@z0/contracts/app-users";
import type { AppDetail } from "@z0/contracts/apps";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import { AppWorkspaceError, AppWorkspaceLayout } from "../../../components/apps/AppWorkspaceLayout";
import { TabActions } from "../../../components/apps/TabActions";
import { DataTable } from "../../../components/crud/DataTable";
import { ResourceTabs } from "../../../components/crud/ResourceTabs";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { ApiError } from "../../../lib/api";
import { fetchApp } from "../../../lib/apps-api";
import {
  createAppUserInvite,
  fetchAppUserInvites,
  fetchAppUsers,
  patchAppUser,
  revokeAppUserInvite,
} from "../../../lib/app-users-api";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";
import { InviteFormDialog } from "../../members/components/InviteFormDialog";
import { CreateAppUserDialog } from "../components/CreateAppUserDialog";
import { AppUserInviteResultDialog } from "../components/AppUserInviteResultDialog";

export function AppUsersPage() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [app, setApp] = useState<AppDetail | null>(null);
  const [users, setUsers] = useState<AppUserSummary[]>([]);
  const [invites, setInvites] = useState<PendingAppUserInvite[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tab, setTab] = useState<"users" | "invites">("users");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreateAppUserInviteResponse | null>(null);
  const usersSearchLoaded = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!appId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    usersSearchLoaded.current = null;

    void (async () => {
      try {
        const [appData, userList, inviteList] = await Promise.all([
          fetchApp(appId),
          fetchAppUsers(appId, ""),
          fetchAppUserInvites(appId),
        ]);
        if (cancelled) return;
        setApp(appData);
        setUsers(userList);
        setInvites(inviteList);
        setDebouncedSearch("");
        setSearch("");
        usersSearchLoaded.current = "";
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Could not load app users.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appId]);

  useEffect(() => {
    if (!appId || loading) return;
    if (usersSearchLoaded.current === debouncedSearch) return;

    let cancelled = false;
    usersSearchLoaded.current = debouncedSearch;

    void fetchAppUsers(appId, debouncedSearch)
      .then((userList) => {
        if (!cancelled) setUsers(userList);
      })
      .catch((e) => {
        if (!cancelled) {
          setNotice(e instanceof ApiError ? e.message : "Could not search users.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appId, debouncedSearch, loading]);

  const reload = useCallback(async () => {
    if (!appId) return;
    try {
      const [appData, userList, inviteList] = await Promise.all([
        fetchApp(appId),
        fetchAppUsers(appId, debouncedSearch),
        fetchAppUserInvites(appId),
      ]);
      setApp(appData);
      setUsers(userList);
      setInvites(inviteList);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not refresh users.");
    }
  }, [appId, debouncedSearch]);

  usePageBreadcrumbs(
    app
      ? [
          { label: "Applications", to: "/apps" },
          { label: app.name, to: `/apps/${appId}` },
          { label: "Users" },
        ]
      : null,
    [app?.name, appId],
  );

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

  if (error || !app || !appId) {
    return <AppWorkspaceError message={error ?? "Application not found."} onRetry={() => void reload()} />;
  }

  const tabs = [
    { id: "users", label: "Users" },
    { id: "invites", label: "Invites" },
  ];

  return (
    <AppWorkspaceLayout appId={appId} app={app} notice={notice}>
      <ResourceTabs tabs={tabs} activeId={tab} onChange={(id) => setTab(id as "users" | "invites")} />

      {tab === "users" ? (
        <div className="space-y-4">
          <TabActions>
            <Button variant="outline" onClick={() => setInviteOpen(true)}>
              Invite
            </Button>
            <Button onClick={() => setCreateOpen(true)}>Add user</Button>
          </TabActions>
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
            ]}
            rows={users}
            onRowClick={(row) => navigate(`/app-users/${appId}/${row.userId}`)}
            emptyMessage="No users yet."
            emptyAction={
              <div className="flex flex-wrap justify-center gap-2">
                <EmptyStateButton onClick={() => setCreateOpen(true)}>Add user</EmptyStateButton>
                <Button type="button" variant="outline" onClick={() => setInviteOpen(true)}>
                  Invite
                </Button>
              </div>
            }
            rowActions={(row) =>
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
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <TabActions>
            <Button onClick={() => setInviteOpen(true)}>Invite</Button>
          </TabActions>
          <DataTable
          rowKey={(row) => row.id}
          columns={[
            { id: "email", header: "Email", cell: (row) => row.email },
            { id: "name", header: "Name", cell: (row) => row.invitedName },
            {
              id: "expires",
              header: "Expires",
              cell: (row) => new Date(row.expiresAt).toLocaleDateString(),
            },
          ]}
          rows={invites}
          onRowClick={(row) => navigate(`/app-users/${appId}/invites/${row.id}`)}
          emptyMessage="No pending invitations."
          emptyAction={<EmptyStateButton onClick={() => setInviteOpen(true)}>Invite</EmptyStateButton>}
          rowActions={(row) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busyId === row.id}
              onClick={() => void handleRevokeInvite(row)}
            >
              Revoke
            </Button>
          )}
        />
        </div>
      )}

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
    </AppWorkspaceLayout>
  );
}
