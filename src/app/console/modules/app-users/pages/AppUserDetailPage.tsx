import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";

import type { AppUserDetail } from "@z0/contracts/app-users";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import { EntityDetailLayout } from "../../../components/layout/EntityDetailLayout";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { FormField } from "../../../components/forms/FormField";
import { FormActions } from "../../../components/forms/FormActions";
import { DangerZone } from "../../../components/forms/DangerZone";
import { DestructiveButton } from "../../../components/forms/DestructiveButton";
import type { SessionSummary } from "@z0/contracts/sessions";
import { DataTable } from "../../../components/crud/DataTable";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import {
  fetchAppUser,
  patchAppUser,
  sendAppUserPasswordReset,
  sendAppUserVerification,
  resetAppUserMfa,
  transitionAppUser,
} from "../../../lib/app-users-api";
import { fetchApp } from "../../../lib/apps-api";
import {
  fetchAppUserSessions,
  revokeAppUserSession,
} from "../../../lib/app-user-sessions-api";

export function AppUserDetailPage() {
  const { appId, userId } = useParams<{ appId: string; userId: string }>();
  const confirm = useConfirm();

  const [user, setUser] = useState<AppUserDetail | null>(null);
  const [appName, setAppName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyStatus, setBusyStatus] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);

  const reloadSessions = useCallback(async () => {
    if (!appId || !userId) return;
    setSessionsLoading(true);
    try {
      setSessions(await fetchAppUserSessions(appId, userId));
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [appId, userId]);

  const reload = useCallback(async () => {
    if (!appId || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const [detail, app] = await Promise.all([fetchAppUser(appId, userId), fetchApp(appId)]);
      setUser(detail);
      setAppName(app.name);
      setName(detail.name);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load app user.");
    } finally {
      setLoading(false);
    }
  }, [appId, userId]);

  useEffect(() => {
    void reload();
    void reloadSessions();
  }, [reload, reloadSessions]);

  usePageBreadcrumbs(
    user && appId
      ? [
          { label: "Apps", to: "/apps" },
          { label: appName ?? "App", to: `/apps/${appId}/setup` },
          { label: "Users", to: `/apps/${appId}/users` },
          { label: user.name },
        ]
      : null,
    [user?.name, appId, appName],
  );

  const nameDirty = user !== null && name.trim() !== user.name;

  async function handleSaveName() {
    if (!appId || !userId || !nameDirty) return;
    setSaving(true);
    setNotice(null);
    setFieldErrors({});
    try {
      const updated = await patchAppUser(appId, userId, { name: name.trim() });
      setUser(updated);
      setName(updated.name);
      setNotice("Name updated.");
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
      } else {
        setNotice("Could not update name.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!appId || !userId || !user) return;
    const disabling = user.status === "active" || user.status === "locked";
    const ok = await confirm({
      title: disabling ? "Disable user" : "Enable user",
      description: disabling
        ? `${user.name} will not be able to sign in to this application.`
        : `${user.name} will be able to sign in again.`,
      confirmLabel: disabling ? "Disable" : "Enable",
      destructive: disabling,
    });
    if (!ok) return;

    setBusyStatus(true);
    setNotice(null);
    try {
      const updated = await transitionAppUser(appId, userId, disabling ? "disable" : "enable");
      if ("userId" in updated) setUser(updated);
      setNotice(disabling ? `${user.name} was disabled.` : `${user.name} was re-enabled.`);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not update status.");
    } finally {
      setBusyStatus(false);
    }
  }

  async function handleLifecycle(action: "unlock" | "delete" | "restore" | "permanently-delete") {
    if (!appId || !userId || !user) return;
    const labels = {
      unlock: ["Unlock user", "Allow this user to try signing in again.", "Unlock"],
      delete: ["Delete user", "Move this account to deleted state and revoke all access. It can still be restored.", "Delete"],
      restore: ["Restore user", "Restore this account as disabled. Enable it separately when access should return.", "Restore"],
      "permanently-delete": ["Permanently delete user", "Remove this account, credentials, grants, sessions, and linked sign-in data. This cannot be undone.", "Permanently delete"],
    } as const;
    const [title, description, confirmLabel] = labels[action];
    const ok = await confirm({
      title,
      description,
      confirmLabel,
      destructive: action === "delete" || action === "permanently-delete",
      confirmationText: action === "permanently-delete" ? user.email : undefined,
    });
    if (!ok) return;
    setBusyStatus(true);
    setNotice(null);
    try {
      await transitionAppUser(appId, userId, action, action === "permanently-delete" ? user.email : undefined);
      if (action === "permanently-delete") {
        window.location.href = `/apps/${appId}/users`;
        return;
      }
      setNotice(action === "restore" ? "User restored as disabled." : action === "unlock" ? "User unlocked." : "User moved to deleted state.");
      await reload();
      await reloadSessions();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not update account.");
    } finally {
      setBusyStatus(false);
    }
  }

  async function handleSendReset() {
    if (!appId || !userId) return;
    setBusyStatus(true);
    try {
      await sendAppUserPasswordReset(appId, userId);
      setNotice("Password reset email sent. Existing sessions and tokens were revoked.");
      await reload();
      await reloadSessions();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not send password reset.");
    } finally {
      setBusyStatus(false);
    }
  }

  async function handleSendVerification() {
    if (!appId || !userId) return;
    setBusyStatus(true);
    try {
      await sendAppUserVerification(appId, userId);
      setNotice("Verification email requested.");
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not send verification email.");
    } finally {
      setBusyStatus(false);
    }
  }

  async function handleResetMfa() {
    if (!appId || !userId || !user) return;
    const ok = await confirm({
      title: "Reset MFA",
      description: `Remove ${user.name}’s authenticator, recovery codes, remembered browsers, sessions, and tokens?`,
      confirmLabel: "Reset MFA",
      destructive: true,
    });
    if (!ok) return;
    setBusyStatus(true);
    try {
      await resetAppUserMfa(appId, userId);
      setNotice("MFA reset. The user must sign in and enroll again.");
      await reload();
      await reloadSessions();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Could not reset MFA.");
    } finally {
      setBusyStatus(false);
    }
  }

  async function handleRevokeSession(session: SessionSummary) {
    if (!appId || !userId) return;
    const ok = await confirm({
      title: "Revoke session",
      description: `Sign out ${session.clientLabel}?`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;

    setBusySessionId(session.id);
    setNotice(null);
    try {
      await revokeAppUserSession(appId, userId, session.id);
      setNotice("Session revoked.");
      await reload();
      await reloadSessions();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not revoke session.");
    } finally {
      setBusySessionId(null);
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error || !user || !appId) {
    return (
      <EntityDetailLayout
        name="User"
        backTo={appId ? `/apps/${appId}/users` : "/apps"}
        backLabel="Back to users"
        tabs={[]}
      >
        <PageError title="Not found" message={error ?? "App user not found."}>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to={appId ? `/apps/${appId}/users` : "/apps"}>Back to users</Link>
          </Button>
        </PageError>
      </EntityDetailLayout>
    );
  }

  return (
    <EntityDetailLayout
      backTo={`/apps/${appId}/users`}
      backLabel="Back to users"
      name={user.name}
      subtitle={user.email}
      badges={
        <Badge variant={user.status === "active" ? "secondary" : "outline"}>
          {user.status}
        </Badge>
      }
    >
      <ActionNotice message={notice} />

      <dl className="mb-6 grid gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{new Date(user.joinedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Active sessions</dt>
          <dd>{user.activeSessionCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Email verification</dt>
          <dd>{user.emailVerified ? "Verified" : "Not verified"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Multi-factor authentication</dt>
          <dd>{user.mfaEnabled ? "Enabled" : "Not enabled"}</dd>
        </div>
      </dl>

      {user.mfaEnabled ? (
        <Button type="button" variant="destructive" disabled={busyStatus} onClick={() => void handleResetMfa()}>
          Reset MFA
        </Button>
      ) : null}

      <form
        className="max-w-md space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSaveName();
        }}
      >
        <FormField label="Name" htmlFor="userName" error={fieldErrors.name}>
          <Input
            id="userName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </FormField>
        <FormActions>
          <Button type="submit" disabled={!nameDirty || saving}>
            {saving ? "Saving…" : "Save name"}
          </Button>
        </FormActions>
      </form>

      <section className="mt-8 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Active sessions</h2>
          <p className="text-sm text-muted-foreground">
            Devices where this user is signed in to the application.
          </p>
        </div>

        {sessionsLoading ? (
          <ListPageSkeleton />
        ) : (
          <DataTable<SessionSummary>
            columns={[
              {
                id: "device",
                header: "Device",
                accessorFn: (row) => row.clientLabel,
                cell: (row) => <span className="font-medium">{row.clientLabel}</span>,
              },
              {
                id: "location",
                header: "Network",
                accessorFn: (row) => row.ipDisplay ?? "",
                cell: (row) => row.ipDisplay ?? "Unknown",
              },
              {
                id: "lastSeen",
                header: "Last active",
                accessorFn: (row) => new Date(row.lastSeenAt).getTime(),
                cell: (row) => new Date(row.lastSeenAt).toLocaleString(),
              },
            ]}
            rows={sessions}
            rowKey={(row) => row.id}
            emptyMessage="No active sessions"
            rowActions={(row) => (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busySessionId === row.id}
                onClick={() => void handleRevokeSession(row)}
              >
                Revoke
              </Button>
            )}
          />
        )}
      </section>

      <section className="mt-8 space-y-3 border-t pt-6">
        <h2 className="text-sm font-medium">Account recovery</h2>
        <div className="flex flex-wrap gap-2">
          {!user.emailVerified && user.status === "active" ? (
            <Button variant="outline" disabled={busyStatus} onClick={() => void handleSendVerification()}>
              Send verification email
            </Button>
          ) : null}
          {(user.status === "active" || user.status === "locked") ? (
            <Button variant="outline" disabled={busyStatus} onClick={() => void handleSendReset()}>
              Send password reset
            </Button>
          ) : null}
          {user.status === "locked" ? (
            <Button variant="outline" disabled={busyStatus} onClick={() => void handleLifecycle("unlock")}>
              Unlock user
            </Button>
          ) : null}
        </div>
      </section>

      {user.status === "active" || user.status === "locked" ? (
        <DangerZone
          title="Disable user"
          description={`${user.name} will not be able to sign in. Sessions, codes, and tokens will be revoked.`}
          action={
            <DestructiveButton disabled={busyStatus} onClick={() => void handleToggleStatus()}>
              Disable user
            </DestructiveButton>
          }
        />
      ) : user.status === "disabled" ? (
        <FormActions>
          <Button variant="outline" disabled={busyStatus} onClick={() => void handleToggleStatus()}>
            Enable user
          </Button>
        </FormActions>
      ) : null}

      {user.status !== "deleted" ? (
        <DangerZone
          title="Delete user"
          description="Move this account to deleted state. It can be restored later, but access is revoked now."
          action={<DestructiveButton disabled={busyStatus} onClick={() => void handleLifecycle("delete")}>Delete user</DestructiveButton>}
        />
      ) : (
        <section className="space-y-4 border-t pt-6">
          <div>
            <h2 className="text-sm font-medium">Deleted account</h2>
            <p className="text-sm text-muted-foreground">Restore as disabled, or permanently remove all account data.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busyStatus} onClick={() => void handleLifecycle("restore")}>Restore as disabled</Button>
            <DestructiveButton disabled={busyStatus} onClick={() => void handleLifecycle("permanently-delete")}>Permanently delete</DestructiveButton>
          </div>
        </section>
      )}
    </EntityDetailLayout>
  );
}
