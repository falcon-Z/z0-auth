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
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { fetchAppUser, patchAppUser } from "../../../lib/app-users-api";
import { fetchApp } from "../../../lib/apps-api";

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
  }, [reload]);

  usePageBreadcrumbs(
    user && appId
      ? [
          { label: "Applications", to: "/apps" },
          { label: appName ?? "Application", to: `/apps/${appId}` },
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
    const disabling = user.membershipStatus === "active";
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
      const updated = await patchAppUser(appId, userId, {
        membershipStatus: disabling ? "disabled" : "active",
      });
      setUser(updated);
      setNotice(disabling ? `${user.name} was disabled.` : `${user.name} was re-enabled.`);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not update status.");
    } finally {
      setBusyStatus(false);
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error || !user || !appId) {
    return (
      <EntityDetailLayout name="User" tabs={[]}>
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
      name={user.name}
      subtitle={user.email}
      badges={
        <Badge variant={user.membershipStatus === "active" ? "secondary" : "outline"}>
          {user.membershipStatus}
        </Badge>
      }
      actions={
        <Button
          variant={user.membershipStatus === "active" ? "destructive" : "outline"}
          disabled={busyStatus}
          onClick={() => void handleToggleStatus()}
        >
          {user.membershipStatus === "active" ? "Disable" : "Enable"}
        </Button>
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
      </dl>

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
        <Button type="submit" disabled={!nameDirty || saving}>
          {saving ? "Saving…" : "Save name"}
        </Button>
      </form>
    </EntityDetailLayout>
  );
}
