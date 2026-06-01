import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { DetailPageHeader } from "../../../components/crud/DetailPageHeader";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useMembersData } from "../../../hooks/use-members-data";
import { useTenantPermissions } from "../../../hooks/use-tenant-permissions";
import { useSession } from "../../../context/session-context";
import { revokeTenantInvite } from "../../../lib/members-api";
import { formatRoleKey } from "../../../lib/tenant-permissions";

export function InviteDetailPage() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { session } = useSession();
  const { canInviteMembers } = useTenantPermissions();
  const tenantId = session.tenant!.id;

  const { invites, loading, reload } = useMembersData(tenantId, true, canInviteMembers);
  const [revoking, setRevoking] = useState(false);

  const invite = invites.find((i) => i.id === inviteId);

  if (!canInviteMembers) {
    return (
      <Alert>
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>You cannot manage invites.</AlertDescription>
      </Alert>
    );
  }

  if (loading) return <ListPageSkeleton />;

  if (!invite) {
    return (
      <div className="space-y-6">
        <DetailPageHeader backTo="/members" backLabel="Members" title="Invitation" />
        <PageError title="Not found" message="Invitation not found or no longer pending.">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/members">Back to members</Link>
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
      await revokeTenantInvite(tenantId, inviteId);
      await reload();
      navigate("/members");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        backTo="/members"
        backLabel="Members"
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
        <div>
          <dt className="text-muted-foreground">Roles</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {invite.roleKeys.map((key) => (
              <Badge key={key} variant="secondary" className="capitalize">
                {formatRoleKey(key)}
              </Badge>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}
