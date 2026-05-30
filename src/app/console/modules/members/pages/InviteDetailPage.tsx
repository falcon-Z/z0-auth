import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { DetailPageHeader } from "../../../components/crud/DetailPageHeader";
import { useMembersData } from "../../../hooks/use-members-data";
import { useTenantPermissions } from "../../../hooks/use-tenant-permissions";
import { useSession } from "../../../context/session-context";
import { revokeTenantInvite } from "../../../lib/members-api";
import { formatRoleKey } from "../../../lib/tenant-permissions";
import { MembersListSkeleton } from "../MembersAccessGate";

export function InviteDetailPage() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
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

  if (loading) return <MembersListSkeleton />;

  if (!invite) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Not found</AlertTitle>
        <AlertDescription>Invite not found or no longer pending.</AlertDescription>
      </Alert>
    );
  }

  async function handleRevoke() {
    if (!inviteId || !window.confirm("Revoke this invitation?")) return;
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
