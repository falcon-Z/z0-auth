import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, AlertCircle, RefreshCw, Users } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@z0/components/ui/card";
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import { useOrg, useOrgPermissions } from "@z0/app/contexts/org-context";
import { useAuth } from "@z0/app/contexts/auth-context";
import { authFetch } from "@z0/utils/api/client";
import { toast } from "sonner";
import {
  MemberTable,
  InviteMemberDialog,
  EditMemberRoleDialog,
  RemoveMemberDialog,
} from "@z0/app/components/organizations";
import type { OrgMember } from "@z0/types";
import type { InviteMemberInput, UpdateMemberRoleInput } from "@z0/validation";

export default function OrgUserManagement() {
  const { currentOrg } = useOrg();
  const { canManageMembers } = useOrgPermissions();
  const { user } = useAuth();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);

  const loadMembers = useCallback(async () => {
    if (!currentOrg) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await authFetch(`/api/v1/orgs/${currentOrg.id}/members`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load members");
      }

      const result = await response.json();
      setMembers(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleInviteUser = async (data: InviteMemberInput) => {
    if (!currentOrg) return;

    try {
      setIsSubmitting(true);

      const response = await authFetch(`/api/v1/orgs/${currentOrg.id}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          roleType: data.roleType,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to send invitation");
      }

      setIsInviteDialogOpen(false);
      await loadMembers();
      toast.success("Invitation sent successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (data: UpdateMemberRoleInput) => {
    if (!currentOrg || !selectedMember?.userId) return;

    try {
      setIsSubmitting(true);

      const response = await authFetch(
        `/api/v1/orgs/${currentOrg.id}/members/${selectedMember.userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleType: data.roleType }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to update role");
      }

      setIsRoleDialogOpen(false);
      setSelectedMember(null);
      await loadMembers();
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!currentOrg || !selectedMember) return;

    try {
      setIsSubmitting(true);

      // Determine if this is an invitation or a member
      const isInvited = selectedMember.memberStatus === "invited";

      if (isInvited && selectedMember.invitationId) {
        // Cancel invitation
        const response = await authFetch(
          `/api/v1/orgs/${currentOrg.id}/invitations/${selectedMember.invitationId}`,
          { method: "DELETE" }
        );

        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.message || "Failed to cancel invitation");
        }
        toast.success("Invitation cancelled");
      } else if (selectedMember.userId) {
        // Remove member
        const response = await authFetch(
          `/api/v1/orgs/${currentOrg.id}/members/${selectedMember.userId}`,
          { method: "DELETE" }
        );

        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.message || "Failed to remove member");
        }
        toast.success("Member removed");
      }

      setIsRemoveDialogOpen(false);
      setSelectedMember(null);
      await loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendInvite = async (member: OrgMember) => {
    if (!currentOrg || !member.invitationId) return;

    try {
      const response = await authFetch(
        `/api/v1/orgs/${currentOrg.id}/invitations/${member.invitationId}/resend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extendExpiry: true }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to resend invitation");
      }

      await loadMembers();
      toast.success("Invitation resent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const openRoleDialog = (member: OrgMember) => {
    setSelectedMember(member);
    setIsRoleDialogOpen(true);
  };

  const openRemoveDialog = (member: OrgMember) => {
    setSelectedMember(member);
    setIsRemoveDialogOpen(true);
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No organization selected</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground mt-1">
            Manage members of {currentOrg.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadMembers} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canManageMembers && (
            <Button onClick={() => setIsInviteDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Organization Members
          </CardTitle>
          <CardDescription>
            {members.length} {members.length === 1 ? "member" : "members"} in{" "}
            {currentOrg.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MemberTable
              data={members}
              loading={isLoading}
              onEditRole={canManageMembers ? openRoleDialog : undefined}
              onRemove={canManageMembers ? openRemoveDialog : undefined}
              onResendInvite={canManageMembers ? handleResendInvite : undefined}
              showActions={canManageMembers}
              currentUserId={user?.id}
              emptyMessage="No members yet. Invite someone to get started."
            />
          )}
        </CardContent>
      </Card>

      {/* Invite Member Dialog */}
      <InviteMemberDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
        onSubmit={handleInviteUser}
        isSubmitting={isSubmitting}
      />

      {/* Edit Role Dialog */}
      <EditMemberRoleDialog
        open={isRoleDialogOpen}
        onOpenChange={setIsRoleDialogOpen}
        member={selectedMember}
        onSubmit={handleUpdateRole}
        isSubmitting={isSubmitting}
      />

      {/* Remove Member Dialog */}
      <RemoveMemberDialog
        open={isRemoveDialogOpen}
        onOpenChange={setIsRemoveDialogOpen}
        member={selectedMember}
        onConfirm={handleRemoveMember}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
