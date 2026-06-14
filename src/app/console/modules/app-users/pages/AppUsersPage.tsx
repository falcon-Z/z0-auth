import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { AppUserSummary } from "@z0/contracts/app-users";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import { TabActions } from "../../../components/apps/TabActions";
import { DataTable } from "../../../components/crud/DataTable";
import { DestructiveButton } from "../../../components/forms/DestructiveButton";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useAppWorkspace } from "../../../context/app-workspace-context";
import { ApiError } from "../../../lib/api";
import { fetchAppUsers, patchAppUser } from "../../../lib/app-users-api";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";
import { CreateAppUserDialog } from "../components/CreateAppUserDialog";

export function AppUsersPage() {
  const { appId, app, setNotice } = useAppWorkspace();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AppUserSummary[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const usersSearchLoaded = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    usersSearchLoaded.current = null;

    void fetchAppUsers(appId, "")
      .then((userList) => {
        if (cancelled) return;
        setUsers(userList);
        setDebouncedSearch("");
        setSearch("");
        usersSearchLoaded.current = "";
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Could not load app users.");
          usersSearchLoaded.current = "";
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appId, setNotice]);

  useEffect(() => {
    if (loading) return;
    if (usersSearchLoaded.current === debouncedSearch) return;

    let cancelled = false;
    usersSearchLoaded.current = debouncedSearch;

    void fetchAppUsers(appId, debouncedSearch)
      .then((userList) => {
        if (!cancelled) {
          setUsers(userList);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setNotice(e instanceof ApiError ? e.message : "Could not search users.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appId, debouncedSearch, loading, setNotice]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchAppUsers(appId, debouncedSearch));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load app users.");
    } finally {
      setLoading(false);
    }
  }, [appId, debouncedSearch]);

  usePageBreadcrumbs(
    [
      { label: "Apps", to: "/apps" },
      { label: app.name, to: `/apps/${appId}/setup` },
      { label: "Users" },
    ],
    [app.name, appId],
  );

  async function handleDisable(user: AppUserSummary) {
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

  if (loading) return <ListPageSkeleton />;

  if (error) {
    return <PageError message={error} onRetry={() => void reload()} />;
  }

  return (
    <div className="space-y-4">
      <TabActions>
        <Button variant="outline" asChild>
          <Link to={`/apps/${appId}/users/invites`}>Invites</Link>
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
        enableSearch={false}
        columns={[
          { id: "name", header: "Name", accessorFn: (row) => row.name, cell: (row) => row.name },
          { id: "email", header: "Email", accessorFn: (row) => row.email, cell: (row) => row.email },
          {
            id: "status",
            header: "Status",
            accessorFn: (row) => row.membershipStatus,
            cell: (row) => (
              <Badge variant={row.membershipStatus === "active" ? "secondary" : "outline"}>
                {row.membershipStatus}
              </Badge>
            ),
          },
        ]}
        rows={users}
        onRowClick={(row) => navigate(`/apps/${appId}/users/${row.userId}`)}
        emptyMessage="No users yet."
        emptyAction={
          <div className="flex flex-wrap justify-center gap-2">
            <EmptyStateButton onClick={() => setCreateOpen(true)}>Add user</EmptyStateButton>
            <Button type="button" variant="outline" asChild>
              <Link to={`/apps/${appId}/users/invites`}>Invites</Link>
            </Button>
          </div>
        }
        rowActions={(row) =>
          row.membershipStatus === "active" ? (
            <DestructiveButton
              type="button"
              size="sm"
              disabled={busyId === row.userId}
              onClick={() => void handleDisable(row)}
            >
              Disable
            </DestructiveButton>
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

      <CreateAppUserDialog
        appId={appId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void reload()}
      />
    </div>
  );
}
