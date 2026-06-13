import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";

import type { PendingAppUserInvite } from "@z0/contracts/app-users";
import { Button } from "@z0/components/ui/button";
import { DetailPageHeader } from "../../../components/crud/DetailPageHeader";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { fetchAppUserInvites, revokeAppUserInvite } from "../../../lib/app-users-api";
import { fetchApp } from "../../../lib/apps-api";

export function AppUserInviteDetailPage() {
  const { appId, inviteId } = useParams<{ appId: string; inviteId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [invite, setInvite] = useState<PendingAppUserInvite | null>(null);
  const [appName, setAppName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const reload = useCallback(async () => {
    if (!appId || !inviteId) return;
    setLoading(true);
    setError(null);
    try {
      const [app, invites] = await Promise.all([fetchApp(appId), fetchAppUserInvites(appId)]);
      setAppName(app.name);
      setInvite(invites.find((i) => i.id === inviteId) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load invitation.");
    } finally {
      setLoading(false);
    }
  }, [appId, inviteId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  usePageBreadcrumbs(
    invite && appId
      ? [
          { label: "Applications", to: "/apps" },
          { label: appName ?? "Application", to: `/apps/${appId}` },
          { label: "Users", to: `/apps/${appId}/users` },
          { label: invite.invitedName },
        ]
      : null,
    [invite?.invitedName, appId, appName],
  );

  async function handleRevoke() {
    if (!appId || !inviteId || !invite) return;
    const ok = await confirm({
      title: "Revoke invitation",
      description: `Revoke the invitation for ${invite.email}?`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;

    setRevoking(true);
    try {
      await revokeAppUserInvite(appId, inviteId);
      navigate(`/apps/${appId}/users`);
    } catch {
      setError("Could not revoke invitation.");
    } finally {
      setRevoking(false);
    }
  }

  if (loading) return <ListPageSkeleton />;

  if (error || !invite || !appId) {
    return (
      <div className="space-y-6">
        <DetailPageHeader title="Invitation" />
        <PageError title="Not found" message={error ?? "Invitation not found or no longer pending."}>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to={appId ? `/apps/${appId}/users` : "/apps"}>Back to users</Link>
          </Button>
        </PageError>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        title={invite.invitedName}
        actions={
          <Button variant="destructive" disabled={revoking} onClick={() => void handleRevoke()}>
            Revoke
          </Button>
        }
      />

      <dl className="grid max-w-lg gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{invite.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{new Date(invite.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Expires</dt>
          <dd>{new Date(invite.expiresAt).toLocaleString()}</dd>
        </div>
      </dl>
    </div>
  );
}
