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
import { ActionNotice } from "../../../components/feedback/ActionNotice";
import { FormActions } from "../../../components/forms/FormActions";
import { DangerZone } from "../../../components/forms/DangerZone";
import { DestructiveButton } from "../../../components/forms/DestructiveButton";
import { useMembersData } from "../../../hooks/use-members-data";
import { usePermissions } from "../../../hooks/use-permissions";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { removeMember, sendMemberPasswordReset, transitionMember } from "../../../lib/members-api";
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
  const [lifecycleNotice, setLifecycleNotice] = useState<string | null>(null);
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
    if (!userId || !member) return;

    let cancelled = false;
    void fetchMemberRoles(userId)
      .then((roles) => {
        if (!cancelled) setSelectedRoleIds(roles.map((role) => role.id));
      })
      .catch(() => {
        if (!cancelled) setSelectedRoleIds([]);
      });
    void fetchRoles()
      .then((roles) => {
        if (!cancelled) setAllRoles(roles);
      })
      .catch(() => {
        if (!cancelled) setAllRoles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, member?.userId]);

  if (loading) return <ListPageSkeleton />;

  if (!member) {
    return (
      <EntityDetailLayout name="Member" backTo="/team" backLabel="Back to team" tabs={[]}>
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
      navigate("/team", { replace: true });
    } finally {
      setRemoving(false);
    }
  }

  async function handleLifecycle(action: "disable" | "enable" | "unlock" | "delete" | "restore" | "permanently-delete") {
    if (!userId || !member) return;
    const labels = {
      disable: "Disable member",
      enable: "Enable member",
      unlock: "Unlock member",
      delete: "Delete member account",
      restore: "Restore member as disabled",
      "permanently-delete": "Permanently delete member",
    } as const;
    const ok = await confirm({
      title: labels[action],
      description: action === "permanently-delete"
        ? "This permanently removes credentials, sessions, roles, and account data. It cannot be undone."
        : action === "delete"
          ? "This revokes console access and moves the account to recoverable deleted state."
          : undefined,
      confirmLabel: labels[action],
      destructive: action === "disable" || action === "delete" || action === "permanently-delete",
      confirmationText: action === "permanently-delete" ? member.email : undefined,
    });
    if (!ok) return;
    setRemoving(true);
    setLifecycleNotice(null);
    try {
      await transitionMember(userId, action, action === "permanently-delete" ? member.email : undefined);
      if (action === "permanently-delete") {
        navigate("/team", { replace: true });
        return;
      }
      setLifecycleNotice(action === "restore" ? "Member restored as disabled." : `Account action completed: ${action}.`);
      await reload();
    } catch (e) {
      setLifecycleNotice(e instanceof ApiError ? e.message : "Could not update member account.");
    } finally {
      setRemoving(false);
    }
  }

  async function handleSendReset() {
    if (!userId) return;
    setRemoving(true);
    try {
      await sendMemberPasswordReset(userId);
      setLifecycleNotice("Password reset email sent. Existing sessions were revoked.");
    } catch (e) {
      setLifecycleNotice(e instanceof ApiError ? e.message : "Could not send password reset.");
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
      backTo="/team"
      backLabel="Back to team"
      name={member.name}
      subtitle={member.email}
      badges={
        <>
          {isSelf ? <Badge variant="outline">You</Badge> : null}
          {member.isBootstrap ? <Badge variant="secondary">Owner</Badge> : null}
          <Badge variant={member.status === "active" ? "secondary" : "outline"}>{member.status}</Badge>
          {member.roles.map((role) => (
            <Badge key={role.id} variant="outline">
              {role.name}
            </Badge>
          ))}
        </>
      }
    >
      <ActionNotice message={lifecycleNotice} />
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
            <div>
              <dt className="text-muted-foreground">Email verification</dt>
              <dd>{member.emailVerified ? "Verified" : "Not verified"}</dd>
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
                <FormActions>
                  <Button disabled={savingRoles || selectedRoleIds.length === 0} onClick={() => void handleSaveRoles()}>
                    {savingRoles ? "Saving…" : "Save roles"}
                  </Button>
                </FormActions>
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

      {!isSelf && !member.isBootstrap && canRemove ? (
        <section className="space-y-3 border-t pt-6">
          <div>
            <h2 className="text-sm font-medium">Account access and recovery</h2>
            <p className="text-sm text-muted-foreground">Status changes revoke existing console sessions. Restored accounts remain disabled.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(member.status === "active" || member.status === "locked") ? (
              <Button variant="outline" disabled={removing} onClick={() => void handleSendReset()}>Send password reset</Button>
            ) : null}
            {member.status === "locked" ? (
              <Button variant="outline" disabled={removing} onClick={() => void handleLifecycle("unlock")}>Unlock</Button>
            ) : null}
            {member.status === "disabled" ? (
              <Button variant="outline" disabled={removing} onClick={() => void handleLifecycle("enable")}>Enable</Button>
            ) : null}
            {member.status === "deleted" ? (
              <Button variant="outline" disabled={removing} onClick={() => void handleLifecycle("restore")}>Restore as disabled</Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {!isSelf && !member.isBootstrap && canRemove && (member.status === "active" || member.status === "locked") ? (
        <DangerZone
          title="Disable member"
          description="Suspend console access and revoke all active console sessions."
          action={<DestructiveButton disabled={removing} onClick={() => void handleLifecycle("disable")}>Disable member</DestructiveButton>}
        />
      ) : null}

      {!isSelf && !member.isBootstrap && canRemove && member.status !== "deleted" ? (
        <DangerZone
          title="Delete member account"
          description="Move the identity to recoverable deleted state and revoke access."
          action={<DestructiveButton disabled={removing} onClick={() => void handleLifecycle("delete")}>Delete account</DestructiveButton>}
        />
      ) : null}

      {!isSelf && !member.isBootstrap && canRemove && member.status === "deleted" ? (
        <DangerZone
          title="Permanently delete member"
          description="Remove the identity, credentials, roles, and sessions. This cannot be undone."
          action={<DestructiveButton disabled={removing} onClick={() => void handleLifecycle("permanently-delete")}>Permanently delete</DestructiveButton>}
        />
      ) : null}

      {!isSelf && !member.isBootstrap && canRemove ? (
        <DangerZone
          title="Remove member"
          description={`Remove ${member.name} from the console. They will lose access immediately.`}
          action={
            <DestructiveButton disabled={removing} onClick={() => void handleRemove()}>
              Remove member
            </DestructiveButton>
          }
        />
      ) : null}
    </EntityDetailLayout>
  );
}
