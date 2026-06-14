import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { InstanceRoleSummary } from "@z0/contracts/rbac";
import { Badge } from "@z0/components/ui/badge";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent } from "@z0/components/ui/card";
import { Checkbox } from "@z0/components/ui/checkbox";
import { Label } from "@z0/components/ui/label";
import { usePageBreadcrumbs } from "../../../hooks/use-page-breadcrumbs";
import { useSession } from "../../../context/session-context";
import { EntityDetailLayout } from "../../../components/layout/EntityDetailLayout";
import { useConfirm } from "../../../components/feedback/ConfirmDialog";
import { ListPageSkeleton } from "../../../components/feedback/ListPageSkeleton";
import { PageError } from "../../../components/feedback/PageError";
import { useMembersData } from "../../../hooks/use-members-data";
import { usePermissions } from "../../../hooks/use-permissions";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { removeMember } from "../../../lib/members-api";
import { fetchMemberRoles, fetchRoles, setMemberRoles, transferOwnership } from "../../../lib/rbac-api";

export function MemberDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { hasScope, isOwner } = usePermissions();
  const { session, refreshSession } = useSession();
  const canManageRoles = hasScope("roles:manage");
  const canRemove = hasScope("members:remove");
  const canTransfer = hasScope("ownership:transfer");

  const { members, loading, reload } = useMembersData();
  const [allRoles, setAllRoles] = useState<InstanceRoleSummary[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  const member = members.find((m) => m.userId === userId);
  const isSelf = userId === session.user?.id;

  usePageBreadcrumbs(
    member
      ? [
          { label: "Team", to: "/team" },
          { label: member.name },
        ]
      : null,
    [member?.name, userId],
  );

  useEffect(() => {
    if (!userId) return;
    void fetchMemberRoles(userId).then((roles) => setSelectedRoleIds(roles.map((role) => role.id)));
    void fetchRoles().then(setAllRoles).catch(() => setAllRoles([]));
  }, [userId]);

  if (loading) return <ListPageSkeleton />;

  if (!member) {
    return (
      <EntityDetailLayout name="Member" tabs={[]}>
        <PageError title="Not found" message="Member not found.">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/team">Back to team</Link>
          </Button>
        </PageError>
      </EntityDetailLayout>
    );
  }

  async function handleRemove() {
    const ok = await confirm({
      title: "Remove member",
      description: `Remove ${member!.name} from the console?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok || !userId) return;

    setRemoving(true);
    try {
      await removeMember(userId);
      navigate("/team");
    } finally {
      setRemoving(false);
    }
  }

  async function handleSaveRoles() {
    if (!userId || selectedRoleIds.length === 0) {
      setRoleError("Choose at least one role.");
      return;
    }
    setSavingRoles(true);
    setRoleError(null);
    try {
      const roles = await setMemberRoles(userId, { roleIds: selectedRoleIds });
      setSelectedRoleIds(roles.map((role) => role.id));
      await reload();
      if (userId === session.user?.id) {
        await refreshSession();
      }
    } catch (e) {
      if (e instanceof ApiError) {
        const fieldErrors = fieldErrorsFromProblem(e.problem);
        setRoleError(fieldErrors.roleIds ?? e.problem.detail ?? "Could not save roles.");
      }
    } finally {
      setSavingRoles(false);
    }
  }

  async function handleTransferOwnership() {
    if (!userId) return;
    const ok = await confirm({
      title: "Transfer ownership",
      description: `Make ${member!.name} the instance owner? You will become an admin.`,
      confirmLabel: "Transfer ownership",
      destructive: true,
    });
    if (!ok) return;

    setTransferring(true);
    setTransferError(null);
    try {
      await transferOwnership({ targetUserId: userId });
      window.location.href = "/";
    } catch (e) {
      if (e instanceof ApiError) {
        setTransferError(e.problem.detail ?? "Could not transfer ownership.");
      }
    } finally {
      setTransferring(false);
    }
  }

  const assignableRoles = allRoles.filter((role) => role.key !== "owner");

  return (
    <EntityDetailLayout
      name={member.name}
      subtitle={member.email}
      badges={
        <>
          {isSelf ? <Badge variant="outline">You</Badge> : null}
          {member.isBootstrap ? <Badge variant="secondary">Owner</Badge> : null}
          {member.roles.map((role) => (
            <Badge key={role.id} variant="outline">
              {role.name}
            </Badge>
          ))}
        </>
      }
      actions={
        !isSelf && !member.isBootstrap && canRemove ? (
          <Button variant="destructive" disabled={removing} onClick={() => void handleRemove()}>
            Remove
          </Button>
        ) : undefined
      }
    >
      <Card className="py-0 shadow-xs">
        <CardContent className="px-5 py-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{member.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>{new Date(member.joinedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {!member.isBootstrap ? (
        <Card className="py-0 shadow-xs">
          <CardContent className="space-y-4 px-5 py-5">
            <div>
              <h2 className="text-sm font-medium">Roles</h2>
              <p className="text-sm text-muted-foreground">Choose what this person can do in the console.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {assignableRoles.map((role) => {
                const id = `member-role-${role.id}`;
                return (
                  <div key={role.id} className="flex items-start gap-2 rounded-md border px-3 py-2">
                    <Checkbox
                      id={id}
                      checked={selectedRoleIds.includes(role.id)}
                      disabled={!canManageRoles}
                      onCheckedChange={(checked) => {
                        setSelectedRoleIds((current) =>
                          checked === true
                            ? [...new Set([...current, role.id])]
                            : current.filter((value) => value !== role.id),
                        );
                      }}
                    />
                    <div>
                      <Label htmlFor={id} className="text-sm font-normal">
                        {role.name}
                      </Label>
                      {role.description ? (
                        <p className="text-xs text-muted-foreground">{role.description}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {canManageRoles ? (
              <>
                {roleError ? <p className="text-sm text-destructive">{roleError}</p> : null}
                <Button disabled={savingRoles || selectedRoleIds.length === 0} onClick={() => void handleSaveRoles()}>
                  {savingRoles ? "Saving…" : "Save roles"}
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isOwner && !isSelf && !member.isBootstrap && canTransfer ? (
        <Card className="py-0 shadow-xs">
          <CardContent className="space-y-3 px-5 py-5">
            <div>
              <h2 className="text-sm font-medium">Ownership</h2>
              <p className="text-sm text-muted-foreground">
                Transfer instance ownership to this team member. You will keep console access as an admin.
              </p>
            </div>
            {transferError ? <p className="text-sm text-destructive">{transferError}</p> : null}
            <Button variant="outline" disabled={transferring} onClick={() => void handleTransferOwnership()}>
              {transferring ? "Transferring…" : "Transfer ownership"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </EntityDetailLayout>
  );
}
