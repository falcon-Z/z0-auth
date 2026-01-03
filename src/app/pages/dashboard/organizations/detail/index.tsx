import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Loader2,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  ArrowLeft,
  Users,
  Zap,
  MoreHorizontal,
  Copy,
  Eye,
  EyeOff,
  Shield,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@z0/components/ui/card";
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@z0/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@z0/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import { Input } from "@z0/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@z0/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { StatusBadge } from "@z0/app/components/shared/status-badge";
import { DataTable, DataTableColumnHeader } from "@z0/app/components/data-table/data-table";
import { EmptyState } from "@z0/app/components/shared/empty-state";
import { TableLoadingSkeleton } from "@z0/app/components/shared/loading-skeleton";
import { AddMemberDialog, EditMemberRoleDialog, RemoveMemberDialog } from "@z0/app/components/organizations";
import { AppSecretDialog, DeleteAppDialog } from "@z0/app/components/applications";
import { Badge } from "@z0/components/ui/badge";
import { authFetch } from "@z0/utils/api/client";
import { toast } from "sonner";
import type { OrgMember, OrgRoleType } from "@z0/types";

const createAppSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  description: z.string().optional(),
  allowedOrigins: z.string().optional(),
});

type CreateAppFormValues = z.infer<typeof createAppSchema>;

interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: string;
  createdAt: string;
  _count: {
    users: number;
    apps: number;
  };
}

interface App {
  id: string;
  name: string;
  slug: string;
  status: string;
  apiKey: string;
  createdAt: string;
}

interface Member {
  membershipId?: string;
  invitationId?: string;
  userId?: string;
  name: string | null;
  email: string;
  avatar?: string | null;
  roleType: OrgRoleType;
  memberStatus: "active" | "invited";
  joinedAt?: string;
  invitedAt?: string;
  invitedBy?: { id: string; name: string; email: string };
  expiresAt?: string;
}

export default function OrganizationDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleApiKeys, setVisibleApiKeys] = useState<Set<string>>(new Set());

  // Member management state
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isChangeRoleOpen, setIsChangeRoleOpen] = useState(false);
  const [isRemoveMemberOpen, setIsRemoveMemberOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [isMemberSubmitting, setIsMemberSubmitting] = useState(false);

  // App management state
  const [createdAppSecret, setCreatedAppSecret] = useState<{ apiKey: string; apiSecret: string } | null>(null);
  const [isSecretDialogOpen, setIsSecretDialogOpen] = useState(false);
  const [isDeleteAppOpen, setIsDeleteAppOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [isAppSubmitting, setIsAppSubmitting] = useState(false);

  const form = useForm<CreateAppFormValues>({
    resolver: zodResolver(createAppSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      allowedOrigins: "",
    },
  });

  useEffect(() => {
    if (id) {
      loadOrganizationDetail();
      loadApps();
      loadMembers();
    }
  }, [id]);

  const loadOrganizationDetail = async () => {
    try {
      const response = await fetch(`/api/v1/orgs/${id}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load organization");
      }

      const result = await response.json();
      setOrganization(result.organization);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const loadApps = async () => {
    try {
      const response = await fetch(`/api/v1/orgs/${id}/apps`, {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        setApps(result.apps || []);
      }
    } catch (err) {
      console.error("Failed to load apps:", err);
    }
  };

  const loadMembers = async () => {
    try {
      const response = await authFetch(`/api/v1/orgs/${id}/members?includeInvited=true`);

      if (response.ok) {
        const result = await response.json();
        setMembers(result.data || []);
      }
    } catch (err) {
      console.error("Failed to load members:", err);
    }
  };

  // Member management handlers
  const handleChangeRole = async (data: { roleType: OrgRoleType }) => {
    if (!id || !selectedMember?.userId) return;
    try {
      setIsMemberSubmitting(true);
      setMemberError(null);
      const response = await authFetch(
        `/api/v1/orgs/${id}/members/${selectedMember.userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to change role");
      }

      setIsChangeRoleOpen(false);
      setSelectedMember(null);
      await loadMembers();
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsMemberSubmitting(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!id || !selectedMember) return;
    try {
      setIsMemberSubmitting(true);
      setMemberError(null);

      const isInvited = selectedMember.memberStatus === "invited";
      const endpoint = isInvited
        ? `/api/v1/orgs/${id}/invitations/${selectedMember.invitationId}`
        : `/api/v1/orgs/${id}/members/${selectedMember.userId}`;

      const response = await authFetch(endpoint, { method: "DELETE" });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to remove member");
      }

      setIsRemoveMemberOpen(false);
      setSelectedMember(null);
      await loadMembers();
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsMemberSubmitting(false);
    }
  };

  const handleResendInvitation = async (member: Member) => {
    if (!id || !member.invitationId) return;
    try {
      const response = await authFetch(
        `/api/v1/orgs/${id}/invitations/${member.invitationId}/resend`,
        { method: "POST" }
      );
      const result = await response.json();
      if (response.ok) {
        // Check if email was sent or if we need mailto fallback
        if (!result.data?.emailSent && result.data?.emailContent) {
          const { subject, body } = result.data.emailContent;
          window.open(
            `mailto:${member.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
          );
        }
      }
    } catch (err) {
      console.error("Failed to resend invitation:", err);
    }
  };

  const openChangeRoleDialog = (member: Member) => {
    setSelectedMember(member);
    setMemberError(null);
    setIsChangeRoleOpen(true);
  };

  const openRemoveMemberDialog = (member: Member) => {
    setSelectedMember(member);
    setMemberError(null);
    setIsRemoveMemberOpen(true);
  };

  const handleCreateApp = async (data: CreateAppFormValues) => {
    try {
      setIsSubmitting(true);
      const allowedOrigins = data.allowedOrigins
        ? data.allowedOrigins.split(",").map((o) => o.trim()).filter(Boolean)
        : [];

      const response = await authFetch(`/api/v1/orgs/${id}/apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          slug: data.slug,
          description: data.description,
          allowedOrigins,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to create application");
      }

      setIsDialogOpen(false);
      form.reset();

      // Show the secret dialog with the newly created app credentials
      if (result.data?.apiSecret) {
        setCreatedAppSecret({
          apiKey: result.data.apiKey,
          apiSecret: result.data.apiSecret,
        });
        setIsSecretDialogOpen(true);
      }

      await loadApps();
      await loadOrganizationDetail();
      toast.success("Application created successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteApp = async () => {
    if (!selectedApp) return;
    try {
      setIsAppSubmitting(true);
      const response = await authFetch(`/api/v1/orgs/${id}/apps/${selectedApp.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Failed to delete application");
      }

      setIsDeleteAppOpen(false);
      setSelectedApp(null);
      await loadApps();
      await loadOrganizationDetail();
      toast.success("Application deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsAppSubmitting(false);
    }
  };

  const openDeleteAppDialog = (app: App) => {
    setSelectedApp(app);
    setIsDeleteAppOpen(true);
  };

  const toggleApiKeyVisibility = (appId: string) => {
    setVisibleApiKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(appId)) {
        newSet.delete(appId);
      } else {
        newSet.add(appId);
      }
      return newSet;
    });
  };

  const copyApiKey = (apiKey: string) => {
    navigator.clipboard.writeText(apiKey);
  };

  // Apps table columns
  const appsColumns: ColumnDef<App>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      accessorKey: "slug",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Slug" />
      ),
      cell: ({ row }) => (
        <code className="text-xs bg-muted px-2 py-1 rounded">
          {row.getValue("slug")}
        </code>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        return <StatusBadge status={status.toLowerCase()} />;
      },
    },
    {
      accessorKey: "apiKey",
      header: "API Key",
      cell: ({ row }) => {
        const apiKey = row.getValue("apiKey") as string;
        const isVisible = visibleApiKeys.has(row.original.id);
        return (
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono">
              {isVisible ? apiKey : `${apiKey.substring(0, 20)}...`}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleApiKeyVisibility(row.original.id)}
            >
              {isVisible ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyApiKey(apiKey)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue("createdAt"));
        return (
          <div className="text-sm text-muted-foreground">
            {formatDistanceToNow(date, { addSuffix: true })}
          </div>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const app = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  navigate(`/dashboard/organizations/${id}/apps/${app.id}`)
                }
              >
                <Edit2 className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => openDeleteAppDialog(app)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  // Members table columns
  const membersColumns: ColumnDef<Member>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => {
          const isInvited = row.original.memberStatus === "invited";
          const displayName = row.original.name || row.original.email.split("@")[0];
          return (
            <div className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm ${
                isInvited ? "bg-amber-100 text-amber-600" : "bg-primary/10 text-primary"
              }`}>
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-medium flex items-center gap-2">
                  {displayName}
                  {isInvited && (
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                      Invited
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{row.original.email}</div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "roleType",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Role" />
        ),
        cell: ({ row }) => {
          const role = row.original.roleType;
          return (
            <Badge variant={role === "ORG_OWNER" ? "default" : "secondary"}>
              {role.replace("ORG_", "")}
            </Badge>
          );
        },
      },
      {
        accessorKey: "joinedAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
          const isInvited = row.original.memberStatus === "invited";
          if (isInvited) {
            return (
              <div className="text-sm text-muted-foreground">
                <span className="text-amber-600">Pending</span>
                {row.original.invitedAt && (
                  <span className="text-xs block">
                    Invited {formatDistanceToNow(new Date(row.original.invitedAt), { addSuffix: true })}
                  </span>
                )}
              </div>
            );
          }
          return (
            <div className="text-sm text-muted-foreground">
              <span className="text-green-600">Active</span>
              {row.original.joinedAt && (
                <span className="text-xs block">
                  Joined {formatDistanceToNow(new Date(row.original.joinedAt), { addSuffix: true })}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const member = row.original;
          const isInvited = member.memberStatus === "invited";

          // For invited members, show different actions
          if (isInvited) {
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleResendInvitation(member)}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Resend Invitation
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => openRemoveMemberDialog(member)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Revoke Invitation
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => openChangeRoleDialog(member)}>
                  <Shield className="mr-2 h-4 w-4" />
                  Change Role
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => openRemoveMemberDialog(member)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove Member
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [handleResendInvitation, openChangeRoleDialog, openRemoveMemberDialog]
  );

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <TableLoadingSkeleton />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Organization not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6 animate-page-enter">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => navigate("/dashboard/organizations")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Organizations
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {organization.name}
            </h1>
            <p className="text-muted-foreground mt-1">
              {organization.description || "No description"}
            </p>
          </div>
          <StatusBadge status={organization.status.toLowerCase()} />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {organization._count.users}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Applications
            </CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {organization._count.apps}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="apps" className="w-full">
        <TabsList>
          <TabsTrigger value="apps">Applications</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="apps" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Applications</h3>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Register App
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Register New Application</DialogTitle>
                  <DialogDescription>
                    Create a new application for {organization.name}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(handleCreateApp)}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>App Name</FormLabel>
                          <FormControl>
                            <Input placeholder="My Application" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="slug"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Slug</FormLabel>
                          <FormControl>
                            <Input placeholder="my-app" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="App description" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="allowedOrigins"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Allowed Origins (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://example.com, https://app.example.com"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSubmitting}
                    >
                      {isSubmitting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Register Application
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {apps.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="No applications"
              description="Register your first application to get started."
              action={
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Register App
                </Button>
              }
            />
          ) : (
            <DataTable columns={appsColumns} data={apps} />
          )}
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Organization Members</h3>
            <Button size="sm" onClick={() => setIsAddMemberOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Member
            </Button>
          </div>

          {members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members"
              description="Invite someone to join this organization."
              action={
                <Button onClick={() => setIsAddMemberOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Member
                </Button>
              }
            />
          ) : (
            <DataTable columns={membersColumns} data={members} />
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">
                  Organization Information
                </h4>
                <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">{organization.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Slug</p>
                    <p className="font-mono text-sm">{organization.slug}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Member Dialog */}
      {id && (
        <AddMemberDialog
          open={isAddMemberOpen}
          onOpenChange={setIsAddMemberOpen}
          organizationId={id}
          onSuccess={() => {
            loadMembers();
            loadOrganizationDetail();
          }}
        />
      )}

      {/* Edit Role Dialog */}
      <EditMemberRoleDialog
        open={isChangeRoleOpen}
        onOpenChange={setIsChangeRoleOpen}
        member={selectedMember as OrgMember | null}
        onSubmit={handleChangeRole}
        isSubmitting={isMemberSubmitting}
      />

      {/* Remove Member Dialog */}
      <RemoveMemberDialog
        open={isRemoveMemberOpen}
        onOpenChange={setIsRemoveMemberOpen}
        member={selectedMember as OrgMember | null}
        onConfirm={handleRemoveMember}
        isSubmitting={isMemberSubmitting}
      />

      {/* App Secret Dialog - shown after app creation */}
      <AppSecretDialog
        open={isSecretDialogOpen}
        onOpenChange={(open) => {
          setIsSecretDialogOpen(open);
          if (!open) setCreatedAppSecret(null);
        }}
        apiKey={createdAppSecret?.apiKey || ""}
        apiSecret={createdAppSecret?.apiSecret || ""}
      />

      {/* Delete App Dialog */}
      <DeleteAppDialog
        open={isDeleteAppOpen}
        onOpenChange={setIsDeleteAppOpen}
        app={selectedApp}
        onConfirm={handleDeleteApp}
        isSubmitting={isAppSubmitting}
      />
    </div>
  );
}
