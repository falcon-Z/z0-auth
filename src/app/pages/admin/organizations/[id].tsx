import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { ColumnDef } from "@tanstack/react-table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Users,
  AppWindow,
  Settings,
  Loader2,
  AlertCircle,
  MoreHorizontal,
  Eye,
  Trash2,
  UserPlus,
  Plus,
  Calendar,
  Shield,
} from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@z0/components/ui/card";
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import { Badge } from "@z0/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@z0/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
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
import { Separator } from "@z0/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@z0/components/ui/alert-dialog";
import { DataTable, DataTableColumnHeader } from "@z0/app/components/data-table/data-table";

// Schemas for member management
const addMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  roleType: z.enum(["ORG_OWNER", "ORG_ADMIN", "ORG_DEVELOPER", "ORG_MEMBER"]),
});

const changeRoleSchema = z.object({
  roleType: z.enum(["ORG_OWNER", "ORG_ADMIN", "ORG_DEVELOPER", "ORG_MEMBER"]),
});

type AddMemberFormValues = z.infer<typeof addMemberSchema>;
type ChangeRoleFormValues = z.infer<typeof changeRoleSchema>;

const ROLE_OPTIONS = [
  { value: "ORG_OWNER", label: "Owner", description: "Full access to organization" },
  { value: "ORG_ADMIN", label: "Admin", description: "Manage members and settings" },
  { value: "ORG_DEVELOPER", label: "Developer", description: "Access to apps and APIs" },
  { value: "ORG_MEMBER", label: "Member", description: "Basic access only" },
] as const;

// Settings form schema
const settingsSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  slug: z.string().min(2, "Slug must be at least 2 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
  maxUsers: z.coerce.number().int().positive().optional().nullable(),
  maxApps: z.coerce.number().int().positive().optional().nullable(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

interface Member {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  roleType: string;
  grantedAt: string;
}

interface App {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: string;
  isPlatformOrg: boolean;
  maxUsers?: number;
  maxApps?: number;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  appCount: number;
  memberships: Member[];
  apps: App[];
}

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Member management state
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isChangeRoleOpen, setIsChangeRoleOpen] = useState(false);
  const [isRemoveMemberOpen, setIsRemoveMemberOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  // Forms
  const addMemberForm = useForm<AddMemberFormValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      email: "",
      name: "",
      password: "",
      roleType: "ORG_MEMBER",
    },
  });

  const changeRoleForm = useForm<ChangeRoleFormValues>({
    resolver: zodResolver(changeRoleSchema),
    defaultValues: {
      roleType: "ORG_MEMBER",
    },
  });

  const settingsForm = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      status: "ACTIVE",
      maxUsers: null,
      maxApps: null,
    },
  });

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (id) {
      loadOrganization();
    }
  }, [id]);

  // Reset settings form when organization loads
  useEffect(() => {
    if (organization) {
      settingsForm.reset({
        name: organization.name,
        slug: organization.slug,
        description: organization.description || "",
        status: organization.status as SettingsFormValues["status"],
        maxUsers: organization.maxUsers || null,
        maxApps: organization.maxApps || null,
      });
    }
  }, [organization]);

  const loadOrganization = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/v1/platform/organizations/${id}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load organization");
      }

      const result = await response.json();
      setOrganization(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Member management handlers
  const handleAddMember = async (data: AddMemberFormValues) => {
    if (!organization) return;
    try {
      setIsSubmitting(true);
      setMemberError(null);
      const response = await fetch(`/api/v1/orgs/${organization.id}/members`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to add member");
      }

      setIsAddMemberOpen(false);
      addMemberForm.reset();
      await loadOrganization();
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeRole = async (data: ChangeRoleFormValues) => {
    if (!organization || !selectedMember) return;
    try {
      setIsSubmitting(true);
      setMemberError(null);
      const response = await fetch(
        `/api/v1/orgs/${organization.id}/members/${selectedMember.userId}`,
        {
          method: "PATCH",
          credentials: "include",
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
      await loadOrganization();
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!organization || !selectedMember) return;
    try {
      setIsSubmitting(true);
      setMemberError(null);
      const response = await fetch(
        `/api/v1/orgs/${organization.id}/members/${selectedMember.userId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to remove member");
      }

      setIsRemoveMemberOpen(false);
      setSelectedMember(null);
      await loadOrganization();
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openChangeRoleDialog = (member: Member) => {
    setSelectedMember(member);
    changeRoleForm.reset({ roleType: member.roleType as ChangeRoleFormValues["roleType"] });
    setMemberError(null);
    setIsChangeRoleOpen(true);
  };

  const openRemoveMemberDialog = (member: Member) => {
    setSelectedMember(member);
    setMemberError(null);
    setIsRemoveMemberOpen(true);
  };

  // Settings handlers
  const handleSaveSettings = async (data: SettingsFormValues) => {
    if (!organization) return;
    try {
      setIsSavingSettings(true);
      setSettingsError(null);
      setSettingsSuccess(null);

      // Update basic info
      const response = await fetch(`/api/v1/platform/organizations/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          slug: data.slug,
          description: data.description || undefined,
          maxUsers: data.maxUsers || undefined,
          maxApps: data.maxApps || undefined,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || result.message || "Failed to update organization");
      }

      // Update status separately if changed
      if (data.status !== organization.status) {
        const statusResponse = await fetch(`/api/v1/platform/organizations/${id}/status`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: data.status }),
        });

        if (!statusResponse.ok) {
          const result = await statusResponse.json();
          throw new Error(result.error || result.message || "Failed to update status");
        }
      }

      setSettingsSuccess("Settings saved successfully");
      await loadOrganization();
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (!organization) return;
    try {
      setIsDeleting(true);
      setSettingsError(null);

      const response = await fetch(`/api/v1/platform/organizations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || result.message || "Failed to delete organization");
      }

      navigate("/admin/organizations");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "An error occurred");
      setIsDeleting(false);
    }
  };

  const members = organization?.memberships || [];
  const apps = organization?.apps || [];

  const memberColumns: ColumnDef<Member>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
              {row.original.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium">{row.original.name}</div>
              <div className="text-xs text-muted-foreground">{row.original.email}</div>
            </div>
          </div>
        ),
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
        accessorKey: "grantedAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Joined" />
        ),
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {new Date(row.original.grantedAt).toLocaleDateString()}
          </div>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const member = row.original;
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
    [openChangeRoleDialog, openRemoveMemberDialog]
  );

  const appColumns: ColumnDef<App>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-blue-100 text-blue-600">
              <AppWindow className="h-4 w-4" />
            </div>
            <div className="font-medium">{row.original.name}</div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => (
          <Badge variant={row.original.status === "ACTIVE" ? "default" : "secondary"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </div>
        ),
      },
      {
        id: "actions",
        cell: () => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete App
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate("/admin/organizations")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Organizations
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "Organization not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/organizations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary font-bold text-xl">
              {organization.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{organization.name}</h1>
                {organization.isPlatformOrg && (
                  <Badge variant="outline">Platform Org</Badge>
                )}
                <Badge
                  variant={
                    organization.status === "ACTIVE"
                      ? "default"
                      : organization.status === "SUSPENDED"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {organization.status}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                <code className="text-sm">{organization.slug}</code>
                {organization.description && ` — ${organization.description}`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setActiveTab("settings")}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Members</p>
                <p className="text-2xl font-bold">{organization.memberCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <AppWindow className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Applications</p>
                <p className="text-2xl font-bold">{organization.appCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="text-lg font-medium">
                  {new Date(organization.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Settings className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Limits</p>
                <p className="text-sm font-medium">
                  {organization.maxUsers || "∞"} users / {organization.maxApps || "∞"} apps
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">
            Members ({organization.memberCount})
          </TabsTrigger>
          <TabsTrigger value="apps">
            Applications ({organization.appCount})
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Organization Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{organization.name}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Slug</p>
                  <code className="px-2 py-1 bg-muted rounded text-sm">{organization.slug}</code>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="font-medium">{organization.description || "No description"}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge
                    variant={
                      organization.status === "ACTIVE"
                        ? "default"
                        : organization.status === "SUSPENDED"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {organization.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>Activity log coming soon...</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Members</CardTitle>
                  <CardDescription>
                    Users who belong to this organization
                  </CardDescription>
                </div>
                <Button onClick={() => {
                  addMemberForm.reset();
                  setMemberError(null);
                  setIsAddMemberOpen(true);
                }}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Member
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={memberColumns}
                data={members}
                emptyState={
                  <div className="flex flex-col items-center justify-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No members found</p>
                  </div>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="apps">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Applications</CardTitle>
                  <CardDescription>
                    Apps registered under this organization
                  </CardDescription>
                </div>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create App
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={appColumns}
                data={apps}
                emptyState={
                  <div className="flex flex-col items-center justify-center py-8">
                    <AppWindow className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No applications found</p>
                  </div>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          {settingsError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{settingsError}</AlertDescription>
            </Alert>
          )}

          {settingsSuccess && (
            <Alert>
              <AlertDescription>{settingsSuccess}</AlertDescription>
            </Alert>
          )}

          <Form {...settingsForm}>
            <form onSubmit={settingsForm.handleSubmit(handleSaveSettings)} className="space-y-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>
                    Update the organization's name, slug, and description
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={settingsForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corporation" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={settingsForm.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slug</FormLabel>
                        <FormControl>
                          <Input placeholder="acme-corp" {...field} />
                        </FormControl>
                        <FormDescription>
                          URL-friendly identifier. Lowercase letters, numbers, and dashes only.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={settingsForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="A brief description of this organization..."
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={settingsForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="INACTIVE">Inactive</SelectItem>
                            <SelectItem value="SUSPENDED">Suspended</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Suspended organizations cannot access the platform.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Resource Limits */}
              <Card>
                <CardHeader>
                  <CardTitle>Resource Limits</CardTitle>
                  <CardDescription>
                    Set maximum allowed resources for this organization
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={settingsForm.control}
                      name="maxUsers"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Users</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Unlimited"
                              {...field}
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                            />
                          </FormControl>
                          <FormDescription>Leave empty for unlimited</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={settingsForm.control}
                      name="maxApps"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Applications</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Unlimited"
                              {...field}
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                            />
                          </FormControl>
                          <FormDescription>Leave empty for unlimited</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button type="submit" disabled={isSavingSettings}>
                  {isSavingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
              </div>
            </form>
          </Form>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions that affect this organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Delete Organization</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete this organization and all its data
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={organization.isPlatformOrg}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Organization
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the organization
                        <strong> {organization.name}</strong> and remove all associated data including
                        memberships, applications, and settings.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteOrganization}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Delete Organization
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {organization.isPlatformOrg && (
                <p className="text-sm text-muted-foreground mt-2">
                  Platform organizations cannot be deleted.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Member Dialog */}
      <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>
              Add a new member to this organization. If the user doesn't exist, a new account will be created.
            </DialogDescription>
          </DialogHeader>
          <Form {...addMemberForm}>
            <form onSubmit={addMemberForm.handleSubmit(handleAddMember)} className="space-y-4">
              {memberError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{memberError}</AlertDescription>
                </Alert>
              )}

              <FormField
                control={addMemberForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="user@example.com" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addMemberForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addMemberForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormDescription>
                      Required only if user doesn't exist
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addMemberForm.control}
                name="roleType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            <div className="flex flex-col">
                              <span>{role.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {role.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
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
                  onClick={() => setIsAddMemberOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Member
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={isChangeRoleOpen} onOpenChange={setIsChangeRoleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for {selectedMember?.name || "this member"}
            </DialogDescription>
          </DialogHeader>
          <Form {...changeRoleForm}>
            <form onSubmit={changeRoleForm.handleSubmit(handleChangeRole)} className="space-y-4">
              {memberError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{memberError}</AlertDescription>
                </Alert>
              )}

              <FormField
                control={changeRoleForm.control}
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
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            <div className="flex flex-col">
                              <span>{role.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {role.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
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
                  onClick={() => setIsChangeRoleOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog open={isRemoveMemberOpen} onOpenChange={setIsRemoveMemberOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {selectedMember?.name || "this member"} from the organization?
              This action can be undone by re-adding them later.
            </DialogDescription>
          </DialogHeader>

          {memberError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{memberError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsRemoveMemberOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
