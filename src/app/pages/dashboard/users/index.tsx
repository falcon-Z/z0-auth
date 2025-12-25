import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  MoreHorizontal,
  AlertCircle,
  Mail,
  UserMinus,
  ShieldCheck,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@z0/components/ui/dialog";
import { Input } from "@z0/components/ui/input";
import { Textarea } from "@z0/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@z0/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@z0/components/ui/badge";
import { useOrg, useOrgPermissions } from "../../../contexts/org-context";

// Role types matching backend
const ORG_ROLES = ["ORG_OWNER", "ORG_ADMIN", "ORG_DEVELOPER", "ORG_MEMBER"] as const;
type OrgRoleType = (typeof ORG_ROLES)[number];

// Invite form schema
const inviteUserSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  roleType: z.enum(["ORG_OWNER", "ORG_ADMIN", "ORG_MEMBER"]),
  message: z.string().max(500, "Message must be 500 characters or less").optional(),
});

type InviteUserFormValues = z.infer<typeof inviteUserSchema>;

// Update role schema
const updateRoleSchema = z.object({
  roleType: z.enum(ORG_ROLES),
});

type UpdateRoleFormValues = z.infer<typeof updateRoleSchema>;

interface OrgMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  avatar?: string | null;
  roleType: OrgRoleType;
  isActive: boolean;
  isDefault: boolean;
  grantedAt: string;
}

const roleLabels: Record<OrgRoleType, string> = {
  ORG_OWNER: "Owner",
  ORG_ADMIN: "Admin",
  ORG_DEVELOPER: "Developer",
  ORG_MEMBER: "Member",
};

const roleDescriptions: Record<string, string> = {
  ORG_OWNER: "Full control over the organization",
  ORG_ADMIN: "Manage members, apps, and settings",
  ORG_MEMBER: "Basic access to organization resources",
};

function getRoleBadgeVariant(role: OrgRoleType): "default" | "secondary" | "outline" {
  switch (role) {
    case "ORG_OWNER":
      return "default";
    case "ORG_ADMIN":
      return "secondary";
    default:
      return "outline";
  }
}

export default function OrgUserManagement() {
  const { currentOrg } = useOrg();
  const { canManageMembers, isOwner } = useOrgPermissions();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);

  const inviteForm = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      roleType: "ORG_MEMBER",
      message: "",
    },
  });

  const roleForm = useForm<UpdateRoleFormValues>({
    resolver: zodResolver(updateRoleSchema),
  });

  const loadMembers = useCallback(async () => {
    if (!currentOrg) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/orgs/${currentOrg.id}/members`, {
        credentials: "include",
      });

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

  const handleInviteUser = async (data: InviteUserFormValues) => {
    if (!currentOrg) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(`/api/v1/orgs/${currentOrg.id}/invitations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: data.email,
          roleType: data.roleType,
          message: data.message || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to send invitation");
      }

      setIsInviteDialogOpen(false);
      inviteForm.reset();
      // Invitation sent - user will appear after they accept
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (data: UpdateRoleFormValues) => {
    if (!currentOrg || !selectedMember) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/members/${selectedMember.userId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ roleType: data.roleType }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update role");
      }

      setIsRoleDialogOpen(false);
      setSelectedMember(null);
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!currentOrg || !selectedMember) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/members/${selectedMember.userId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to remove member");
      }

      setIsRemoveDialogOpen(false);
      setSelectedMember(null);
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRoleDialog = (member: OrgMember) => {
    setSelectedMember(member);
    roleForm.reset({ roleType: member.roleType });
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
            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite a new member</DialogTitle>
                  <DialogDescription>
                    Send an invitation email to join {currentOrg.name}
                  </DialogDescription>
                </DialogHeader>
                <Form {...inviteForm}>
                  <form
                    onSubmit={inviteForm.handleSubmit(handleInviteUser)}
                    className="space-y-4"
                  >
                    <FormField
                      control={inviteForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email address</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="colleague@example.com"
                              autoComplete="email"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={inviteForm.control}
                      name="roleType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {isOwner && (
                                <SelectItem value="ORG_OWNER">
                                  <div className="flex flex-col">
                                    <span>Owner</span>
                                    <span className="text-xs text-muted-foreground">
                                      {roleDescriptions.ORG_OWNER}
                                    </span>
                                  </div>
                                </SelectItem>
                              )}
                              <SelectItem value="ORG_ADMIN">
                                <div className="flex flex-col">
                                  <span>Admin</span>
                                  <span className="text-xs text-muted-foreground">
                                    {roleDescriptions.ORG_ADMIN}
                                  </span>
                                </div>
                              </SelectItem>
                              <SelectItem value="ORG_MEMBER">
                                <div className="flex flex-col">
                                  <span>Member</span>
                                  <span className="text-xs text-muted-foreground">
                                    {roleDescriptions.ORG_MEMBER}
                                  </span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={inviteForm.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Personal message (optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Add a personal note to the invitation..."
                              className="resize-none"
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            This message will be included in the invitation email
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsInviteDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Send Invitation
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
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
          <CardTitle>Organization Members</CardTitle>
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
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No members yet. Invite someone to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  {canManageMembers && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.membershipId}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{member.name}</span>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {member.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(member.roleType)}>
                        {roleLabels[member.roleType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(member.grantedAt).toLocaleDateString()}
                    </TableCell>
                    {canManageMembers && (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openRoleDialog(member)}>
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Change role
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => openRemoveDialog(member)}
                              disabled={member.roleType === "ORG_OWNER"}
                            >
                              <UserMinus className="mr-2 h-4 w-4" />
                              Remove member
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Update Role Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change member role</DialogTitle>
            <DialogDescription>
              Update the role for {selectedMember?.name}
            </DialogDescription>
          </DialogHeader>
          <Form {...roleForm}>
            <form onSubmit={roleForm.handleSubmit(handleUpdateRole)} className="space-y-4">
              <FormField
                control={roleForm.control}
                name="roleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isOwner && (
                          <SelectItem value="ORG_OWNER">Owner</SelectItem>
                        )}
                        <SelectItem value="ORG_ADMIN">Admin</SelectItem>
                        <SelectItem value="ORG_DEVELOPER">Developer</SelectItem>
                        <SelectItem value="ORG_MEMBER">Member</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRoleDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Role
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation */}
      <AlertDialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {selectedMember?.name} from{" "}
              {currentOrg.name}? They will lose access to all organization resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
