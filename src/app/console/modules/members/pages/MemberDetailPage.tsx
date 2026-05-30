import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { DetailPageHeader } from "../../../components/crud/DetailPageHeader";
import { useMembersData } from "../../../hooks/use-members-data";
import { useTenantPermissions } from "../../../hooks/use-tenant-permissions";
import { useSession } from "../../../context/session-context";
import { updateMemberRoles, removeMember } from "../../../lib/members-api";
import { formatRoleKey } from "../../../lib/tenant-permissions";
import { MembersListSkeleton } from "../MembersAccessGate";
import { EditRolesDialog } from "../components/EditRolesDialog";

export function MemberDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { session } = useSession();
  const { canInviteMembers } = useTenantPermissions();
  const tenantId = session.tenant!.id;

  const { members, roles, loading, reload } = useMembersData(tenantId, true, canInviteMembers);
  const [editOpen, setEditOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const member = members.find((m) => m.userId === userId);

  if (loading) return <MembersListSkeleton />;

  if (!member) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Not found</AlertTitle>
        <AlertDescription>Member not found.</AlertDescription>
      </Alert>
    );
  }

  async function handleRemove() {
    if (!userId || !window.confirm(`Remove ${member!.name} from this tenant?`)) return;
    setRemoving(true);
    try {
      await removeMember(tenantId, userId);
      navigate("/members");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-6">
      <DetailPageHeader
        backTo="/members"
        backLabel="Members"
        title={member.name}
        actions={
          canInviteMembers ? (
            <>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                Edit roles
              </Button>
              <Button variant="destructive" disabled={removing} onClick={() => void handleRemove()}>
                Remove
              </Button>
            </>
          ) : undefined
        }
      />

      <dl className="grid max-w-lg gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{member.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{new Date(member.joinedAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Roles</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {member.roleKeys.map((key) => (
              <Badge key={key} variant="secondary" className="capitalize">
                {formatRoleKey(key)}
              </Badge>
            ))}
          </dd>
        </div>
      </dl>

      {canInviteMembers ? (
        <EditRolesDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          roles={roles}
          initialRoleKeys={member.roleKeys}
          onSave={async (roleKeys) => {
            await updateMemberRoles(tenantId, member.userId, roleKeys);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}
