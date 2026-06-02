import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { CreateInviteResponse, PendingInvite, RoleSummary, TenantMember } from "@z0/contracts/invites";
import type { TenantSummary } from "@z0/contracts/tenants";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { DataTable } from "../../../components/crud/DataTable";
import { ResourceTabs } from "../../../components/crud/ResourceTabs";
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { EmptyStateButton } from "../../../components/feedback/EmptyState";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { EntityDetailLayout } from "../../../components/layout/EntityDetailLayout";
import { ApiError } from "../../../lib/api";
import {
  createTenantInvite,
  fetchPendingInvites,
  fetchTenantMembers,
  fetchTenantRoles,
  removeMember,
  revokeTenantInvite,
  updateMemberRoles,
} from "../../../lib/members-api";
import { assignableRolesFromSession, formatRoleKey } from "../../../lib/tenant-permissions";
import { fetchTenants } from "../../../lib/tenants-api";
import { useSession } from "../../../context/session-context";
import { EditRolesDialog } from "../../members/components/EditRolesDialog";
import { InviteFormDialog } from "../../members/components/InviteFormDialog";
import { InviteResultDialog } from "../../members/components/InviteResultDialog";

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { session } = useSession();
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "members" | "invites">("overview");
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [membersForbidden, setMembersForbidden] = useState(false);
  const [invitesForbidden, setInvitesForbidden] = useState(false);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreateInviteResponse | null>(null);
  const [editMember, setEditMember] = useState<TenantMember | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const tenants = await fetchTenants();
      const match = tenants.find((t) => t.id === tenantId);
      if (!match) {
        setError("Tenant not found or you cannot view it.");
        setTenant(null);
      } else {
        setTenant(match);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load tenant.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const reloadControls = useCallback(async () => {
    if (!tenantId) return;

    setControlsError(null);
    setMembersForbidden(false);
    setInvitesForbidden(false);

    try {
      const loadedRoles = await fetchTenantRoles();
      setRoles(loadedRoles);
    } catch (e) {
      setControlsError(e instanceof ApiError ? e.message : "Could not load tenant controls.");
      return;
    }

    try {
      setMembers(await fetchTenantMembers(tenantId));
    } catch (e) {
      if (e instanceof ApiError && e.problem.status === 403) {
        setMembersForbidden(true);
      } else {
        setControlsError(e instanceof ApiError ? e.message : "Could not load members.");
      }
      setMembers([]);
    }

    try {
      setInvites(await fetchPendingInvites(tenantId));
    } catch (e) {
      if (e instanceof ApiError && e.problem.status === 403) {
        setInvitesForbidden(true);
      } else {
        setControlsError(e instanceof ApiError ? e.message : "Could not load invites.");
      }
      setInvites([]);
    }
  }, [tenantId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!loading && tenant) {
      void reloadControls();
    }
  }, [loading, tenant, reloadControls]);

  if (loading) {
    return <ListPageSkeleton />;
  }

  if (error || !tenant) {
    return (
      <EntityDetailLayout backTo="/tenants" backLabel="Tenants" name="Tenant" tabs={[]}>
        <PageError title="Not found" message={error ?? "Tenant not found."} onRetry={() => void reload()} />
      </EntityDetailLayout>
    );
  }

  const assignableRoleKeys = new Set(assignableRolesFromSession(session));
  const assignableRoleList = roles.filter((role) => assignableRoleKeys.has(role.key));
  const canReadMembers = !membersForbidden;
  const canInviteMembers = !invitesForbidden;
  const tabs = [
    { id: "overview", label: "Overview" },
    ...(canReadMembers ? [{ id: "members", label: "Members" }] : []),
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
    setControlsError(null);
    try {
      await removeMember(tenantId, member.userId);
      setNotice(`${member.name} was removed.`);
      await reloadControls();
    } catch (e) {
      setControlsError(e instanceof ApiError ? e.message : "Could not remove member.");
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
    setControlsError(null);
    try {
      await revokeTenantInvite(tenantId, invite.id);
      setNotice("Invitation revoked.");
      await reloadControls();
    } catch (e) {
      setControlsError(e instanceof ApiError ? e.message : "Could not revoke invitation.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <EntityDetailLayout
      backTo="/tenants"
      backLabel="Tenants"
      name={tenant.name}
      subtitle={tenant.slug}
      badges={
        <>
          {tenant.isDefault ? <Badge variant="outline">Default</Badge> : null}
        </>
      }
      activeTabId={tab}
      tabs={tabs}
      onTabChange={(id) => setTab(id as "overview" | "members" | "invites")}
      actions={
        canInviteMembers ? (
          <Button type="button" onClick={() => setInviteOpen(true)}>
            Invite
          </Button>
        ) : undefined
      }
    >
      <ActionNotice message={notice} />
      {controlsError ? <PageError message={controlsError} onRetry={() => void reloadControls()} /> : null}

      {tab === "overview" ? (
        <dl className="grid max-w-lg gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Slug</dt>
            <dd>{tenant.slug}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tenant ID</dt>
            <dd className="break-all font-mono text-xs">{tenant.id}</dd>
          </div>
        </dl>
      ) : null}

      {tab === "members" && canReadMembers ? (
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
          emptyMessage="No members yet"
          emptyAction={
            canInviteMembers ? (
              <EmptyStateButton onClick={() => setInviteOpen(true)}>Invite someone</EmptyStateButton>
            ) : undefined
          }
          rowActions={(member) => {
            const isSelf = member.userId === session.user?.id;
            return (
              <>
                {canInviteMembers && assignableRoleList.length > 0 ? (
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
      ) : null}

      {tab === "invites" && canInviteMembers ? (
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
                    <Badge key={key} variant="secondary" className="capitalize">
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
          emptyMessage="No pending invitations"
          emptyAction={
            <EmptyStateButton onClick={() => setInviteOpen(true)}>Invite someone</EmptyStateButton>
          }
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
      ) : null}

      <InviteFormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={assignableRoleList.length > 0 ? assignableRoleList : roles}
        onSubmit={async (body) => {
          if (!tenantId) throw new Error("No tenant selected");
          const result = await createTenantInvite(tenantId, body);
          await reloadControls();
          return result;
        }}
        onCreated={(result) => {
          setCreatedInvite(result);
          setInviteOpen(false);
        }}
      />

      <InviteResultDialog invite={createdInvite} onClose={() => setCreatedInvite(null)} />

      <EditRolesDialog
        open={Boolean(editMember)}
        onOpenChange={(open) => {
          if (!open) setEditMember(null);
        }}
        roles={assignableRoleList.length > 0 ? assignableRoleList : roles}
        initialRoleKeys={editMember?.roleKeys ?? []}
        onSave={async (roleKeys) => {
          if (!tenantId || !editMember) return;
          await updateMemberRoles(tenantId, editMember.userId, roleKeys);
          setNotice("Roles updated.");
          await reloadControls();
        }}
      />
    </EntityDetailLayout>
  );
}
