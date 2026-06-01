import { useCallback, useEffect, useState } from "react";

import type { PlatformUserSummary } from "@z0/contracts/users";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { ApiError } from "../../../lib/api";
import { fetchPlatformUsers, updateUserStatus } from "../../../lib/users-api";
import { sessionHasPermission } from "../../../lib/tenant-permissions";
import { useSession } from "../../../context/session-context";
import { UsersListSkeleton } from "../UsersAccessGate";

export function UsersListPage() {
  const { session } = useSession();
  const canWriteUsers = sessionHasPermission(session, "platform:users:write");
  const [users, setUsers] = useState<PlatformUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    if (!window.confirm(`${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${user.name}?`)) return;

    setBusyId(user.id);
    setActionError(null);
    try {
      const updated = await updateUserStatus(user.id, nextStatus);
      setUsers((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : `Could not ${verb} user.`);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <UsersListSkeleton />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <ListPageHeader title="Users" />

      {actionError ? (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

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
            id: "roles",
            header: "Platform roles",
            cell: (row) =>
              row.platformRoles.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {row.platformRoles.map((role) => (
                    <Badge key={role} variant="outline">
                      {role.replace(/^platform_/, "").replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
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
        emptyMessage="No users"
        rowActions={
          canWriteUsers
            ? (user) => {
          const isSelf = user.id === session.user?.id;
          if (isSelf) return null;
          const disabling = user.status === "active";
          return (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={disabling ? "text-destructive hover:text-destructive" : undefined}
              disabled={busyId === user.id}
              onClick={() => void handleToggleStatus(user)}
            >
              {disabling ? "Disable" : "Enable"}
            </Button>
          );
            }
            : undefined
        }
      />
    </div>
  );
}
