import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { ColumnDef } from "@tanstack/react-table";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import { Separator } from "@z0/components/ui/separator";
import { DataTable, DataTableColumnHeader } from "@z0/app/components/data-table/data-table";

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

  useEffect(() => {
    if (id) {
      loadOrganization();
    }
  }, [id]);

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
                <Shield className="mr-2 h-4 w-4" />
                Change Role
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Remove Member
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    []
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
          <Button variant="outline" onClick={() => navigate(`/admin/organizations/${id}/edit`)}>
            Edit Organization
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
                <Button>
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

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
              <CardDescription>
                Manage organization configuration and limits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2">Resource Limits</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max Users</span>
                      <span>{organization.maxUsers || "Unlimited"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max Apps</span>
                      <span>{organization.maxApps || "Unlimited"}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Danger Zone</h4>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Organization
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
