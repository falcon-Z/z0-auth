import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";

import { Button } from "@z0/components/ui/button";
import { DetailPageHeader } from "../../../components/crud/DetailPageHeader";
import { DangerZone } from "../../../components/forms/DangerZone";
import { DestructiveButton } from "../../../components/forms/DestructiveButton";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useMembersData } from "../../../hooks/use-members-data";
import { revokeInstanceInvite } from "../../../lib/members-api";

export function InviteDetailPage() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const { invites, loading, reload } = useMembersData();
  const [revoking, setRevoking] = useState(false);

  const invite = invites.find((i) => i.id === inviteId);

  usePageBreadcrumbs(
    invite
      ? [
          { label: "Team", to: "/team" },
          { label: invite.invitedName },
        ]
      : null,
    [invite?.invitedName, inviteId],
  );

  if (loading) return <ListPageSkeleton />;

  if (!invite) {
    return (
      <div className="space-y-6">
        <DetailPageHeader title="Invitation" backTo="/team?tab=invites" backLabel="Back to invites" />
        <PageError title="Not found" message="Invitation not found or no longer pending.">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/team">Back to team</Link>
          </Button>
        </PageError>
      </div>
    );
  }

  async function handleRevoke() {
    const ok = await confirm({
      title: "Revoke invitation",
      description: `Revoke the invitation for ${invite!.email}?`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok || !inviteId) return;

    setRevoking(true);
    try {
      await revokeInstanceInvite(inviteId);
      await reload();
      navigate("/team", { replace: true });
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        backTo="/team?tab=invites"
        backLabel="Back to invites"
        title={invite.invitedName}
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

      <DangerZone
        title="Revoke invitation"
        description="Cancel this invitation. The link will stop working."
        action={
          <DestructiveButton disabled={revoking} onClick={() => void handleRevoke()}>
            Revoke invitation
          </DestructiveButton>
        }
      />
    </div>
  );
}
