import { useState } from "react";
import { useNavigate } from "react-router-dom";

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
import { formatRoleKey } from "../../../lib/tenant-permissions";
import { MembersListSkeleton } from "../MembersAccessGate";
import { BulkInviteDialog } from "../components/BulkInviteDialog";
import { InviteFormDialog } from "../components/InviteFormDialog";
import { InviteResultDialog } from "../components/InviteResultDialog";

export function MembersListPage() {
  const navigate = useNavigate();
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreateInviteResponse | null>(null);

  const tabs = [
    { id: "members", label: "Members" },
    ...(canInviteMembers ? [{ id: "invites", label: "Invites" }] : []),
  ];

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
            <>
              <Button variant="outline" onClick={() => setBulkOpen(true)}>
                Bulk invite
              </Button>
              <Button onClick={() => setInviteOpen(true)}>Invite</Button>
            </>
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
              cell: (row) => (
                <span className="font-medium">{row.name}</span>
              ),
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
          onRowClick={(row) => navigate(`/members/${row.userId}`)}
          emptyMessage="No members"
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
          onRowClick={(row) => navigate(`/members/invites/${row.id}`)}
          emptyMessage="No pending invites"
        />
      )}

      <InviteFormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles}
        onSubmit={(body) => submitInvite(body)}
        onCreated={setCreatedInvite}
      />

      <BulkInviteDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        roles={roles}
        onSubmitRow={(body) => submitInvite(body)}
        onDone={() => void reload()}
      />

      <InviteResultDialog invite={createdInvite} onClose={() => setCreatedInvite(null)} />
    </div>
  );
}
