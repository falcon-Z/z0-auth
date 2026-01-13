import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  AlertCircle,
  Mail,
  MoreHorizontal,
  Send,
  XCircle,
  Clock,
  CheckCircle,
  RefreshCw,
} from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@z0/components/ui/card";
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@z0/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@z0/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@z0/components/ui/tabs";
import { Badge } from "@z0/components/ui/badge";
import { useOrg, useOrgPermissions } from "../../../contexts/org-context";

type InvitationStatus = "pending" | "accepted" | "declined" | "revoked" | "expired";

interface InvitedBy {
  id: string;
  name: string;
  email: string;
}

interface Invitation {
  id: string;
  email: string;
  roleType: "ORG_OWNER" | "ORG_ADMIN" | "ORG_MEMBER";
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  invitedBy: InvitedBy;
  message?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  revokedAt?: string | null;
}

const roleLabels: Record<string, string> = {
  ORG_OWNER: "Owner",
  ORG_ADMIN: "Admin",
  ORG_MEMBER: "Member",
};

const statusConfig: Record<
  InvitationStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: React.ElementType }
> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  accepted: { label: "Accepted", variant: "default", icon: CheckCircle },
  declined: { label: "Declined", variant: "outline", icon: XCircle },
  revoked: { label: "Revoked", variant: "destructive", icon: XCircle },
  expired: { label: "Expired", variant: "outline", icon: Clock },
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return "Expired";
  } else if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Tomorrow";
  } else {
    return `${diffDays} days`;
  }
}

export default function InvitationsPage() {
  const { currentOrg } = useOrg();
  const { canManageMembers } = useOrgPermissions();

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);

  const loadInvitations = useCallback(async () => {
    if (!currentOrg) return;

    try {
      setIsLoading(true);
      setError(null);

      const status = activeTab === "all" ? "all" : activeTab;
      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/invitations?status=${status}`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load invitations");
      }

      const result = await response.json();
      setInvitations(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg, activeTab]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleResend = async (invitation: Invitation) => {
    if (!currentOrg) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/invitations/${invitation.id}/resend`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to resend invitation");
      }

      await loadInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!currentOrg || !selectedInvitation) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/invitations/${selectedInvitation.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to revoke invitation");
      }

      setIsRevokeDialogOpen(false);
      setSelectedInvitation(null);
      await loadInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRevokeDialog = (invitation: Invitation) => {
    setSelectedInvitation(invitation);
    setIsRevokeDialogOpen(true);
  };

  if (!currentOrg) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No organization selected</p>
      </div>
    );
  }

  const renderInvitationsTable = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (invitations.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No {activeTab === "all" ? "" : activeTab} invitations</p>
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Invited By</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Status</TableHead>
            {canManageMembers && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => {
            const statusInfo = statusConfig[invitation.status];
            const StatusIcon = statusInfo.icon;

            return (
              <TableRow key={invitation.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{invitation.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{roleLabels[invitation.roleType]}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm">{invitation.invitedBy.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {invitation.invitedBy.email}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(invitation.createdAt)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {invitation.status === "pending"
                    ? formatRelativeTime(invitation.expiresAt)
                    : formatDate(invitation.expiresAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={statusInfo.variant} className="gap-1">
                    <StatusIcon className="h-3 w-3" />
                    {statusInfo.label}
                  </Badge>
                </TableCell>
                {canManageMembers && (
                  <TableCell className="text-right">
                    {invitation.status === "pending" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={isSubmitting}>
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleResend(invitation)}>
                            <Send className="mr-2 h-4 w-4" />
                            Resend invitation
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => openRevokeDialog(invitation)}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Revoke invitation
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Invitations</h1>
          <p className="text-muted-foreground mt-1">
            Manage invitations for {currentOrg.name}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadInvitations}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Organization Invitations</CardTitle>
          <CardDescription>
            View and manage invitations sent to join {currentOrg.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="accepted">Accepted</TabsTrigger>
              <TabsTrigger value="expired">Expired</TabsTrigger>
              <TabsTrigger value="revoked">Revoked</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>{renderInvitationsTable()}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Revoke Confirmation */}
      <AlertDialog open={isRevokeDialogOpen} onOpenChange={setIsRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the invitation to{" "}
              <strong>{selectedInvitation?.email}</strong>? The invitation link will no
              longer work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke Invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
