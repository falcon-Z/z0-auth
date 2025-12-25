import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  Loader2,
  Plus,
  AlertCircle,
  AppWindow,
  MoreHorizontal,
  Settings,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@z0/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@z0/components/ui/dialog";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@z0/components/ui/badge";
import { useOrg, useOrgPermissions } from "../../../contexts/org-context";

// Create app schema
const createAppSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and dashes only"),
  description: z.string().max(500).optional(),
  allowedOrigins: z.string().optional(),
});

type CreateAppFormValues = z.infer<typeof createAppSchema>;

interface App {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  apiKey: string;
  memberCount?: number;
  createdAt: string;
}

interface CreatedAppResponse {
  id: string;
  name: string;
  slug: string;
  apiKey: string;
  apiSecret: string;
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  ACTIVE: { label: "Active", variant: "default" },
  INACTIVE: { label: "Inactive", variant: "secondary" },
  SUSPENDED: { label: "Suspended", variant: "destructive" },
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { canManageApps } = useOrgPermissions();

  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSecretDialogOpen, setIsSecretDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [createdApp, setCreatedApp] = useState<CreatedAppResponse | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const form = useForm<CreateAppFormValues>({
    resolver: zodResolver(createAppSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      allowedOrigins: "",
    },
  });

  const loadApps = useCallback(async () => {
    if (!currentOrg) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/orgs/${currentOrg.id}/apps`, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load applications");
      }

      const result = await response.json();
      setApps(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  // Auto-generate slug from name
  const watchName = form.watch("name");
  useEffect(() => {
    if (watchName && !form.getValues("slug")) {
      const slug = watchName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      form.setValue("slug", slug);
    }
  }, [watchName, form]);

  const handleCreateApp = async (data: CreateAppFormValues) => {
    if (!currentOrg) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const allowedOrigins = data.allowedOrigins
        ? data.allowedOrigins
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : [];

      const response = await fetch(`/api/v1/orgs/${currentOrg.id}/apps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: data.name,
          slug: data.slug,
          description: data.description || undefined,
          allowedOrigins,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create application");
      }

      const result = await response.json();
      setCreatedApp(result.data);
      setIsCreateDialogOpen(false);
      setIsSecretDialogOpen(true);
      form.reset();
      await loadApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteApp = async () => {
    if (!currentOrg || !selectedApp) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/apps/${selectedApp.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete application");
      }

      setIsDeleteDialogOpen(false);
      setSelectedApp(null);
      await loadApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copySecret = async () => {
    if (createdApp?.apiSecret) {
      await navigator.clipboard.writeText(createdApp.apiSecret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const closeSecretDialog = () => {
    setIsSecretDialogOpen(false);
    setCreatedApp(null);
    setCopiedSecret(false);
  };

  const openDeleteDialog = (app: App) => {
    setSelectedApp(app);
    setIsDeleteDialogOpen(true);
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Applications</h1>
          <p className="text-muted-foreground mt-1">
            Manage applications for {currentOrg.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadApps} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canManageApps && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Application
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create a new application</DialogTitle>
                  <DialogDescription>
                    Register a new application in {currentOrg.name}
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
                          <FormLabel>Application name</FormLabel>
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
                            <Input placeholder="my-application" {...field} />
                          </FormControl>
                          <FormDescription>
                            Unique identifier for your application (lowercase, dashes)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Brief description of your application..."
                              className="resize-none"
                              rows={3}
                              {...field}
                            />
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
                          <FormLabel>Allowed origins (optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://example.com, https://app.example.com"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Comma-separated list of allowed CORS origins
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreateDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Create Application
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

      {/* Apps Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : apps.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AppWindow className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No applications yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first application to start integrating with Z0 Auth.
            </p>
            {canManageApps && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Application
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => {
            const status = statusConfig[app.status] || statusConfig.INACTIVE;
            return (
              <Card key={app.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{app.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">
                        {app.slug}
                      </CardDescription>
                    </div>
                    {canManageApps && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              navigate(`/org/${currentOrg.slug}/apps/${app.id}`)
                            }
                          >
                            <Settings className="mr-2 h-4 w-4" />
                            Settings
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => openDeleteDialog(app)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {app.memberCount !== undefined && (
                      <span>{app.memberCount} members</span>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="text-xs text-muted-foreground">
                  Created {formatDate(app.createdAt)}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* API Secret Dialog - One-time display */}
      <Dialog open={isSecretDialogOpen} onOpenChange={closeSecretDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Application created successfully</DialogTitle>
            <DialogDescription>
              Copy your API secret now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Save this secret</AlertTitle>
            <AlertDescription>
              Store this API secret securely. If you lose it, you will need to
              regenerate a new one.
            </AlertDescription>
          </Alert>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">API Key</label>
              <div className="mt-1 p-3 bg-muted rounded-md font-mono text-sm break-all">
                {createdApp?.apiKey}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">API Secret</label>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 p-3 bg-muted rounded-md font-mono text-sm break-all">
                  {createdApp?.apiSecret}
                </div>
                <Button variant="outline" size="icon" onClick={copySecret}>
                  {copiedSecret ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={closeSecretDialog}>I've saved the secret</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete application</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedApp?.name}</strong>? This
              will revoke all API keys and remove access for all users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteApp}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
