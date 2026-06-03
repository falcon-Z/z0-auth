import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { PlatformUserSummary } from "@z0/contracts/users";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { RowActionLink } from "../../../components/crud/RowActionLink";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { fetchPlatformUsers, updateUserStatus } from "../../../lib/users-api";
import { hasConsoleAccess } from "../../../lib/console-access";
import { useSession } from "../../../context/session-context";

export function UsersListPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { session } = useSession();
  const canWriteUsers = hasConsoleAccess(session);
  const [users, setUsers] = useState<PlatformUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchPlatformUsers());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleToggleStatus(user: PlatformUserSummary) {
    const nextStatus = user.status === "active" ? "disabled" : "active";
    const verb = nextStatus === "disabled" ? "disable" : "enable";
    const ok = await confirm({
      title: `${verb.charAt(0).toUpperCase()}${verb.slice(1)} user`,
      description: `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${user.name}?`,
      confirmLabel: verb.charAt(0).toUpperCase() + verb.slice(1),
      destructive: nextStatus === "disabled",
    });
    if (!ok) return;

    setBusyId(user.id);
    setActionError(null);
    setNotice(null);
    try {
      const updated = await updateUserStatus(user.id, nextStatus);
      setUsers((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setNotice(`Account ${nextStatus === "disabled" ? "disabled" : "enabled"}.`);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : `Could not ${verb} user.`);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <ListPageHeader
        title="Platform users"
        description="Every account that can sign in to this IAM instance."
      />
        <PageError message={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title="Platform users"
        description="Every account that can sign in to this IAM instance."
      />

      <ActionNotice message={notice} />

      {actionError ? <PageError message={actionError} /> : null}

      <DataTable<PlatformUserSummary>
        columns={[
          {
            id: "name",
            header: "Name",
            cell: (row) => <span className="font-medium">{row.name}</span>,
          },
          { id: "email", header: "Email", cell: (row) => row.email },
          {
            id: "status",
            header: "Status",
            cell: (row) => (
              <Badge variant={row.status === "active" ? "secondary" : "outline"} className="capitalize">
                {row.status}
              </Badge>
            ),
          },
          {
            id: "member",
            header: "Console",
            cell: (row) =>
              row.isInstanceMember ? (
                <Badge variant="secondary">Team member</Badge>
              ) : (
                "—"
              ),
          },
          {
            id: "created",
            header: "Created",
            cell: (row) => new Date(row.createdAt).toLocaleDateString(),
          },
        ]}
        rows={users}
        rowKey={(row) => row.id}
        onRowClick={(user) => navigate(`/users/${user.id}`)}
        emptyMessage="No users"
        rowActions={(user) => {
          const isSelf = user.id === session.user?.id;
          return (
            <>
              <RowActionLink to={`/users/${user.id}`}>View</RowActionLink>
              {canWriteUsers && !isSelf ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={user.status === "active" ? "text-destructive hover:text-destructive" : undefined}
                  disabled={busyId === user.id}
                  onClick={() => void handleToggleStatus(user)}
                >
                  {user.status === "active" ? "Disable" : "Enable"}
                </Button>
              ) : null}
            </>
          );
        }}
      />
    </div>
  );
}
