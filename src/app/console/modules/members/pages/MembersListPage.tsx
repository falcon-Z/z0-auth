import { useState } from "react";

import type { CreateInviteResponse, PendingInvite, TenantMember } from "@z0/contracts/invites";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { ResourceTabs } from "../../../components/crud/ResourceTabs";
import { useMembersData } from "../../../hooks/use-members-data";
import { useTenantPermissions } from "../../../hooks/use-tenant-permissions";
import { useSession } from "../../../context/session-context";
import { removeMember, revokeTenantInvite, updateMemberRoles } from "../../../lib/members-api";
import { assignableRolesFromSession, formatRoleKey } from "../../../lib/tenant-permissions";
import { MembersListSkeleton } from "../MembersAccessGate";
import { EditRolesDialog } from "../components/EditRolesDialog";
import { InviteFormDialog } from "../components/InviteFormDialog";
import { InviteResultDialog } from "../components/InviteResultDialog";

export function MembersListPage() {
  const { session } = useSession();
  const { canInviteMembers } = useTenantPermissions();
  const tenantId = session.tenant!.id;

  const { members, invites, roles, loading, forbidden, error, submitInvite, reload } = useMembersData(
    tenantId,
    true,
    canInviteMembers,
  );

  const [tab, setTab] = useState<"members" | "invites">("members");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreateInviteResponse | null>(null);
  const [editMember, setEditMember] = useState<TenantMember | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const assignableRoleKeys = new Set(assignableRolesFromSession(session));
  const assignableRoleList = roles.filter((role) => assignableRoleKeys.has(role.key));

  const tabs = [
    { id: "members", label: "Members" },
    ...(canInviteMembers ? [{ id: "invites", label: "Invites" }] : []),
  ];

  async function handleRemoveMember(member: TenantMember) {
    if (!window.confirm(`Remove ${member.name} from this organization?`)) return;
    setBusyId(member.userId);
    try {
      await removeMember(tenantId, member.userId);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevokeInvite(invite: PendingInvite) {
    if (!window.confirm(`Revoke the invitation for ${invite.email}?`)) return;
    setBusyId(invite.id);
    try {
      await revokeTenantInvite(tenantId, invite.id);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <MembersListSkeleton />;

  if (forbidden || error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error ?? "Could not load data."}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title="Members"
        actions={
          canInviteMembers ? (
            <Button onClick={() => setInviteOpen(true)}>Invite</Button>
          ) : undefined
        }
      />

      {canInviteMembers ? (
        <ResourceTabs tabs={tabs} activeId={tab} onChange={(id) => setTab(id as "members" | "invites")} />
      ) : null}

      {(tab === "members" || !canInviteMembers) && (
        <DataTable<TenantMember>
          columns={[
            {
              id: "name",
              header: "Name",
              cell: (row) => <span className="font-medium">{row.name}</span>,
            },
            { id: "email", header: "Email", cell: (row) => row.email },
            {
              id: "roles",
              header: "Roles",
              cell: (row) => (
                <div className="flex flex-wrap gap-1">
                  {row.roleKeys.map((key) => (
                    <Badge key={key} variant="secondary" className="capitalize">
                      {formatRoleKey(key)}
                    </Badge>
                  ))}
                </div>
              ),
            },
            {
              id: "joined",
              header: "Joined",
              cell: (row) => new Date(row.joinedAt).toLocaleDateString(),
            },
          ]}
          rows={members}
          rowKey={(row) => row.userId}
          emptyMessage="No members"
          rowActions={
            canInviteMembers
              ? (member) => {
                  const isSelf = member.userId === session.user!.id;
                  return (
                    <>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditMember(member)}>
                        Roles
                      </Button>
                      {!isSelf ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={busyId === member.userId}
                          onClick={() => void handleRemoveMember(member)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </>
                  );
                }
              : undefined
          }
        />
      )}

      {tab === "invites" && canInviteMembers && (
        <DataTable<PendingInvite>
          columns={[
            {
              id: "name",
              header: "Name",
              cell: (row) => <span className="font-medium">{row.invitedName}</span>,
            },
            { id: "email", header: "Email", cell: (row) => row.email },
            {
              id: "roles",
              header: "Roles",
              cell: (row) => (
                <div className="flex flex-wrap gap-1">
                  {row.roleKeys.map((key) => (
                    <Badge key={key} variant="outline" className="capitalize">
                      {formatRoleKey(key)}
                    </Badge>
                  ))}
                </div>
              ),
            },
            {
              id: "expires",
              header: "Expires",
              cell: (row) => new Date(row.expiresAt).toLocaleDateString(),
            },
          ]}
          rows={invites}
          rowKey={(row) => row.id}
          emptyMessage="No pending invites"
          rowActions={(invite) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busyId === invite.id}
              onClick={() => void handleRevokeInvite(invite)}
            >
              Revoke
            </Button>
          )}
        />
      )}

      <InviteFormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={assignableRoleList}
        onSubmit={(body) => submitInvite(body)}
        onCreated={setCreatedInvite}
      />

      <InviteResultDialog invite={createdInvite} onClose={() => setCreatedInvite(null)} />

      {editMember ? (
        <EditRolesDialog
          open
          onOpenChange={(open) => !open && setEditMember(null)}
          roles={assignableRoleList}
          initialRoleKeys={editMember.roleKeys}
          onSave={async (roleKeys) => {
            await updateMemberRoles(tenantId, editMember.userId, roleKeys);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}
