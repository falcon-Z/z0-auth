import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import type { CreateInviteResponse, InstanceMember, PendingInvite } from "@z0/contracts/invites";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { ResourceTabs } from "../../../components/crud/ResourceTabs";
import { TeamWorkspaceLayout } from "../../../components/team/TeamWorkspaceLayout";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useMembersData } from "../../../hooks/use-members-data";
import { useSession } from "../../../context/session-context";
import { usePermissions } from "../../../hooks/use-permissions";
import { removeMember, revokeInstanceInvite } from "../../../lib/members-api";
import { InviteFormDialog } from "../components/InviteFormDialog";
import { InviteResultDialog } from "../components/InviteResultDialog";

function roleLabels(member: InstanceMember): string {
  if (member.roles.length > 0) {
    return member.roles.map((role) => role.name).join(", ");
  }
  return member.isBootstrap ? "Owner" : "Member";
}

export function MembersListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const confirm = useConfirm();
  const { hasScope } = usePermissions();
  const { session } = useSession();
  const canInvite = hasScope("members:invite");
  const canRemove = hasScope("members:remove");

  const { members, invites, loading, error, submitInvite, reload, revokeInvite } = useMembersData();

  const [tab, setTab] = useState<"members" | "invites">(() =>
    searchParams.get("tab") === "invites" ? "invites" : "members",
  );

  useEffect(() => {
    setTab(searchParams.get("tab") === "invites" ? "invites" : "members");
  }, [searchParams]);

  function setActiveTab(id: "members" | "invites") {
    setTab(id);
    if (id === "invites") {
      setSearchParams({ tab: "invites" }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }
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
      <TeamWorkspaceLayout title="Team">
        <PageError message={error} onRetry={() => void reload()} />
      </TeamWorkspaceLayout>
    );
  }

  return (
    <TeamWorkspaceLayout
      title="Team"
      actions={canInvite ? <Button onClick={() => setInviteOpen(true)}>Invite</Button> : undefined}
    >
      <ActionNotice message={notice} />

      <ResourceTabs
        tabs={tabs}
        activeId={tab}
        onChange={(id) => setActiveTab(id as "members" | "invites")}
        panels={{
          members: (
            <DataTable<InstanceMember>
              columns={[
                {
                  id: "name",
                  header: "Name",
                  accessorFn: (row) => row.name,
                  cell: (row) => <span className="font-medium">{row.name}</span>,
                },
                { id: "email", header: "Email", accessorFn: (row) => row.email, cell: (row) => row.email },
                {
                  id: "roles",
                  header: "Roles",
                  accessorFn: (row) => roleLabels(row),
                  cell: (row) => (
                    <div className="flex flex-wrap gap-1">
                      {row.isBootstrap ? <Badge variant="secondary">Owner</Badge> : null}
                      {row.roles.map((role) => (
                        <Badge key={role.id} variant="outline">
                          {role.name}
                        </Badge>
                      ))}
                    </div>
                  ),
                },
                {
                  id: "joined",
                  header: "Joined",
                  accessorFn: (row) => new Date(row.joinedAt).getTime(),
                  cell: (row) => new Date(row.joinedAt).toLocaleDateString(),
                },
              ]}
              rows={members}
              rowKey={(row) => row.userId}
              onRowClick={(member) => navigate(`/team/${member.userId}`)}
              emptyMessage="No members yet"
              emptyAction={
                canInvite ? <EmptyStateButton onClick={() => setInviteOpen(true)}>Invite someone</EmptyStateButton> : undefined
              }
              rowActions={(member) => {
                const isSelf = member.userId === session.user!.id;
                if (isSelf || member.isBootstrap || !canRemove) return null;
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
          ),
          invites: (
            <DataTable<PendingInvite>
              columns={[
                {
                  id: "name",
                  header: "Name",
                  accessorFn: (row) => row.invitedName,
                  cell: (row) => <span className="font-medium">{row.invitedName}</span>,
                },
                { id: "email", header: "Email", accessorFn: (row) => row.email, cell: (row) => row.email },
                {
                  id: "roles",
                  header: "Roles",
                  accessorFn: (row) => row.roles.map((role) => role.name).join(", "),
                  cell: (row) => (
                    <div className="flex flex-wrap gap-1">
                      {row.roles.map((role) => (
                        <Badge key={role.id} variant="outline">
                          {role.name}
                        </Badge>
                      ))}
                    </div>
                  ),
                },
                {
                  id: "expires",
                  header: "Expires",
                  accessorFn: (row) => new Date(row.expiresAt).getTime(),
                  cell: (row) => new Date(row.expiresAt).toLocaleDateString(),
                },
              ]}
              rows={invites}
              rowKey={(row) => row.id}
              onRowClick={(invite) => navigate(`/team/invites/${invite.id}`)}
              emptyMessage="No pending invitations"
              emptyAction={
                canInvite ? <EmptyStateButton onClick={() => setInviteOpen(true)}>Invite someone</EmptyStateButton> : undefined
              }
              rowActions={(invite) =>
                canInvite ? (
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
                ) : null
              }
            />
          ),
        }}
      />

      {hasScope("roles:read") ? (
        <p className="text-sm">
          <Button variant="link" className="h-auto p-0" asChild>
            <Link to="/team/roles">Manage roles and permissions</Link>
          </Button>
        </p>
      ) : null}

      {canInvite ? (
        <InviteFormDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onSubmit={(body) => submitInvite(body)}
          onCreated={setCreatedInvite}
        />
      ) : null}

      <InviteResultDialog invite={createdInvite} onClose={() => setCreatedInvite(null)} />
    </TeamWorkspaceLayout>
  );
}
