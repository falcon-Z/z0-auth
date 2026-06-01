import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { PlatformUserDetail } from "@z0/contracts/users";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { EntityDetailLayout } from "../../../components/layout/EntityDetailLayout";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { fetchPlatformUser, updateUserStatus } from "../../../lib/users-api";
import { formatRoleKey, sessionHasPermission } from "../../../lib/tenant-permissions";
import { useSession } from "../../../context/session-context";

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const confirm = useConfirm();
  const { session } = useSession();
  const canWriteUsers = sessionHasPermission(session, "platform:users:write");
  const [user, setUser] = useState<PlatformUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "tenants">("overview");

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      setUser(await fetchPlatformUser(userId));
    } catch (e) {
      if (e instanceof ApiError && e.problem.status === 404) {
        setError("User not found.");
      } else {
        setError(e instanceof ApiError ? e.message : "Could not load user.");
      }
      setUser(null);
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
        <EntityDetailLayout backTo="/users" backLabel="Platform users" name="User" tabs={[]}>
          <PageError title="Not found" message={error ?? "User not found."}>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/users">Back to users</Link>
            </Button>
          </PageError>
        </EntityDetailLayout>
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
      setUser((prev) =>
        prev
          ? {
              ...prev,
              status: updated.status,
              activeSessionCount: nextStatus === "disabled" ? 0 : prev.activeSessionCount,
            }
          : prev,
      );
      setNotice(`Account ${nextStatus === "disabled" ? "disabled" : "enabled"}.`);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : `Could not ${verb} user.`);
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "tenants" as const, label: "Tenants" },
  ];

  return (
    <EntityDetailLayout
      backTo="/users"
      backLabel="Platform users"
      name={user.name}
      subtitle={user.email}
      badges={
        <Badge variant={user.status === "active" ? "secondary" : "outline"} className="capitalize">
          {user.status}
        </Badge>
      }
      tabs={tabs}
      activeTabId={tab}
      onTabChange={(id) => setTab(id as "overview" | "tenants")}
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
    >
      <ActionNotice message={notice} />
      {actionError ? <PageError message={actionError} /> : null}

      {tab === "overview" ? (
        <dl className="grid gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>
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
            <dt className="text-muted-foreground">Active sessions</dt>
            <dd className="tabular-nums">{user.activeSessionCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Member of</dt>
            <dd className="tabular-nums">
              {user.tenantMemberships.length}{" "}
              {user.tenantMemberships.length === 1 ? "tenant" : "tenants"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{new Date(user.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
      ) : user.tenantMemberships.length > 0 ? (
        <ul className="divide-y rounded-lg border text-sm">
          {user.tenantMemberships.map((m) => (
            <li
              key={m.tenantId}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{m.tenantName}</p>
                <p className="text-xs text-muted-foreground">{m.tenantSlug}</p>
                <p className="text-xs text-muted-foreground">
                  Joined {new Date(m.joinedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {m.roleKeys.map((role) => (
                  <Badge key={role} variant="secondary" className="capitalize">
                    {formatRoleKey(role)}
                  </Badge>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">This user is not a member of any tenant.</p>
      )}
    </EntityDetailLayout>
  );
}
