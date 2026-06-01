import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { PlatformUserSummary } from "@z0/contracts/users";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DetailPageHeader } from "../../../components/crud/DetailPageHeader";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { fetchPlatformUsers, updateUserStatus } from "../../../lib/users-api";
import { formatRoleKey, sessionHasPermission } from "../../../lib/tenant-permissions";
import { useSession } from "../../../context/session-context";

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const confirm = useConfirm();
  const { session } = useSession();
  const canWriteUsers = sessionHasPermission(session, "platform:users:write");
  const [user, setUser] = useState<PlatformUserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const users = await fetchPlatformUsers();
      const match = users.find((u) => u.id === userId);
      if (!match) setError("User not found.");
      else setUser(match);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load user.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) return <ListPageSkeleton />;

  if (error || !user) {
    return (
      <div className="space-y-6">
        <DetailPageHeader backTo="/users" backLabel="Users" title="User" />
        <PageError title="Not found" message={error ?? "User not found."}>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/users">Back to users</Link>
          </Button>
        </PageError>
      </div>
    );
  }

  const isSelf = user.id === session.user?.id;
  const disabling = user.status === "active";

  async function handleToggleStatus() {
    const nextStatus = user!.status === "active" ? "disabled" : "active";
    const verb = nextStatus === "disabled" ? "disable" : "enable";
    const ok = await confirm({
      title: `${verb.charAt(0).toUpperCase()}${verb.slice(1)} user`,
      description: `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${user!.name}?`,
      confirmLabel: verb.charAt(0).toUpperCase() + verb.slice(1),
      destructive: nextStatus === "disabled",
    });
    if (!ok) return;

    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const updated = await updateUserStatus(user!.id, nextStatus);
      setUser(updated);
      setNotice(`Account ${nextStatus === "disabled" ? "disabled" : "enabled"}.`);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : `Could not ${verb} user.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        backTo="/users"
        backLabel="Users"
        title={user.name}
        actions={
          canWriteUsers && !isSelf ? (
            <Button
              type="button"
              variant={disabling ? "destructive" : "outline"}
              disabled={busy}
              onClick={() => void handleToggleStatus()}
            >
              {disabling ? "Disable account" : "Enable account"}
            </Button>
          ) : undefined
        }
      />

      <ActionNotice message={notice} />

      {actionError ? <PageError message={actionError} /> : null}

      <dl className="grid max-w-lg gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge variant={user.status === "active" ? "secondary" : "outline"} className="capitalize">
              {user.status}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Platform roles</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {user.platformRoles.length > 0 ? (
              user.platformRoles.map((role) => (
                <Badge key={role} variant="outline" className="capitalize">
                  {formatRoleKey(role)}
                </Badge>
              ))
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{new Date(user.createdAt).toLocaleString()}</dd>
        </div>
      </dl>
    </div>
  );
}
