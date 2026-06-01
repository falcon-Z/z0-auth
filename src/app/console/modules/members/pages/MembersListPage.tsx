import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { CreateInviteResponse, PendingInvite, TenantMember } from "@z0/contracts/invites";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { RowActionLink } from "../../../components/crud/RowActionLink";
import { ResourceTabs } from "../../../components/crud/ResourceTabs";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useMembersData } from "../../../hooks/use-members-data";
import { useTenantPermissions } from "../../../hooks/use-tenant-permissions";
import { useSession } from "../../../context/session-context";
import { removeMember, revokeTenantInvite, updateMemberRoles } from "../../../lib/members-api";
import { assignableRolesFromSession, formatRoleKey } from "../../../lib/tenant-permissions";
import { EditRolesDialog } from "../components/EditRolesDialog";
import { InviteFormDialog } from "../components/InviteFormDialog";
import { InviteResultDialog } from "../components/InviteResultDialog";

export function MembersListPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { session } = useSession();
  const { canReadMembers, canInviteMembers } = useTenantPermissions();
  const tenantId = session.tenant?.id;

  const { members, invites, roles, loading, forbidden, error, submitInvite, reload } = useMembersData(
    tenantId,
    canReadMembers,
    canInviteMembers,
  );

  const [tab, setTab] = useState<"members" | "invites">("members");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreateInviteResponse | null>(null);
  const [editMember, setEditMember] = useState<TenantMember | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const assignableRoleKeys = new Set(assignableRolesFromSession(session));
  const assignableRoleList = roles.filter((role) => assignableRoleKeys.has(role.key));

  const tabs = [
    { id: "members", label: "Members" },
    ...(canInviteMembers ? [{ id: "invites", label: "Invites" }] : []),
  ];

  async function handleRemoveMember(member: TenantMember) {
    if (!tenantId) return;
    const ok = await confirm({
      title: "Remove member",
      description: `Remove ${member.name} from this tenant?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;

    setBusyId(member.userId);
    setNotice(null);
    try {
      await removeMember(tenantId, member.userId);
      setNotice(`${member.name} was removed.`);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevokeInvite(invite: PendingInvite) {
    if (!tenantId) return;
    const ok = await confirm({
      title: "Revoke invitation",
      description: `Revoke the invitation for ${invite.email}?`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;

    setBusyId(invite.id);
    setNotice(null);
    try {
      await revokeTenantInvite(tenantId, invite.id);
      setNotice("Invitation revoked.");
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  if (!tenantId) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="Members" />
        <PageError title="No tenant" message="Choose an active tenant to view members." />
      </div>
    );
  }

  if (loading) return <ListPageSkeleton />;

  if (forbidden || !canReadMembers) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="Members" />
        <PageError title="Access denied" message="You cannot view members for this tenant." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <ListPageHeader title="Members" />
        <PageError message={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ListPageHeader
        title="Members"
        description={
          session.tenant?.name
            ? `People who belong to ${session.tenant.name} — not everyone on the platform.`
            : undefined
        }
        actions={
          canInviteMembers ? (
            <Button onClick={() => setInviteOpen(true)}>Invite</Button>
          ) : undefined
        }
      />

      <ActionNotice message={notice} />

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
          onRowClick={(member) => navigate(`/members/${member.userId}`)}
          emptyMessage="No members yet"
          emptyAction={
            canInviteMembers ? (
              <EmptyStateButton onClick={() => setInviteOpen(true)}>Invite someone</EmptyStateButton>
            ) : undefined
          }
          rowActions={(member) => {
            const isSelf = member.userId === session.user!.id;
            return (
              <>
                <RowActionLink to={`/members/${member.userId}`}>View</RowActionLink>
                {canInviteMembers ? (
                  <>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditMember(member)}>
                      Edit roles
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
                ) : null}
              </>
            );
          }}
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
          onRowClick={(invite) => navigate(`/members/invites/${invite.id}`)}
          emptyMessage="No pending invitations"
          emptyAction={<EmptyStateButton onClick={() => setInviteOpen(true)}>Invite someone</EmptyStateButton>}
          rowActions={(invite) => (
            <>
              <RowActionLink to={`/members/invites/${invite.id}`}>View</RowActionLink>
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
            </>
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
            setNotice("Roles updated.");
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}
