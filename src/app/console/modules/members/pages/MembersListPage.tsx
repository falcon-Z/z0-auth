import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { CreateInviteResponse, InstanceMember, PendingInvite } from "@z0/contracts/invites";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { ResourceTabs } from "../../../components/crud/ResourceTabs";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useMembersData } from "../../../hooks/use-members-data";
import { useSession } from "../../../context/session-context";
import { removeMember, revokeInstanceInvite } from "../../../lib/members-api";
import { InviteFormDialog } from "../components/InviteFormDialog";
import { InviteResultDialog } from "../components/InviteResultDialog";

export function MembersListPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { session } = useSession();

  const { members, invites, loading, error, submitInvite, reload, revokeInvite } = useMembersData();

  const [tab, setTab] = useState<"members" | "invites">("members");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreateInviteResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const tabs = [
    { id: "members", label: "Members" },
    { id: "invites", label: "Invites" },
  ];

  async function handleRemoveMember(member: InstanceMember) {
    const ok = await confirm({
      title: "Remove member",
      description: `Remove ${member.name} from the console?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;

    setBusyId(member.userId);
    setNotice(null);
    try {
      await removeMember(member.userId);
      setNotice(`${member.name} was removed.`);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevokeInvite(invite: PendingInvite) {
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
      await revokeInvite(invite.id);
      setNotice("Invitation revoked.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <ListPageSkeleton />;

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
        actions={<Button onClick={() => setInviteOpen(true)}>Invite</Button>}
      />

      <ActionNotice message={notice} />

      <ResourceTabs tabs={tabs} activeId={tab} onChange={(id) => setTab(id as "members" | "invites")} />

      {tab === "members" && (
        <DataTable<InstanceMember>
          columns={[
            {
              id: "name",
              header: "Name",
              cell: (row) => <span className="font-medium">{row.name}</span>,
            },
            { id: "email", header: "Email", cell: (row) => row.email },
            {
              id: "role",
              header: "Role",
              cell: (row) =>
                row.isBootstrap ? (
                  <Badge variant="secondary">Owner</Badge>
                ) : (
                  <Badge variant="outline">Member</Badge>
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
          emptyAction={<EmptyStateButton onClick={() => setInviteOpen(true)}>Invite someone</EmptyStateButton>}
          rowActions={(member) => {
            const isSelf = member.userId === session.user!.id;
            if (isSelf || member.isBootstrap) return null;
            return (
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
            );
          }}
        />
      )}

      {tab === "invites" && (
        <DataTable<PendingInvite>
          columns={[
            {
              id: "name",
              header: "Name",
              cell: (row) => <span className="font-medium">{row.invitedName}</span>,
            },
            { id: "email", header: "Email", cell: (row) => row.email },
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
        onSubmit={(body) => submitInvite(body)}
        onCreated={setCreatedInvite}
      />

      <InviteResultDialog invite={createdInvite} onClose={() => setCreatedInvite(null)} />
    </div>
  );
}
