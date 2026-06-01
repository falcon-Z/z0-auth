import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DetailPageHeader } from "../../../components/crud/DetailPageHeader";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useMembersData } from "../../../hooks/use-members-data";
import { useTenantPermissions } from "../../../hooks/use-tenant-permissions";
import { useSession } from "../../../context/session-context";
import { updateMemberRoles, removeMember } from "../../../lib/members-api";
import { formatRoleKey } from "../../../lib/tenant-permissions";
import { EditRolesDialog } from "../components/EditRolesDialog";

export function MemberDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { session } = useSession();
  const { canInviteMembers } = useTenantPermissions();
  const tenantId = session.tenant!.id;

  const { members, roles, loading, reload } = useMembersData(tenantId, true, canInviteMembers);
  const [editOpen, setEditOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const member = members.find((m) => m.userId === userId);

  if (loading) return <ListPageSkeleton />;

  if (!member) {
    return (
      <div className="space-y-6">
        <DetailPageHeader backTo="/members" backLabel="Members" title="Member" />
        <PageError title="Not found" message="Member not found.">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/members">Back to members</Link>
          </Button>
        </PageError>
      </div>
    );
  }

  async function handleRemove() {
    const ok = await confirm({
      title: "Remove member",
      description: `Remove ${member!.name} from this tenant?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok || !userId) return;

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
