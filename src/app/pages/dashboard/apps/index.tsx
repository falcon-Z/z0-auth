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
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@z0/components/ui/dropdown-menu";
import { Badge } from "@z0/components/ui/badge";
import { useOrg, useOrgPermissions } from "@z0/app/contexts/org-context";
import { authFetch } from "@z0/utils/api/client";
import { toast } from "sonner";
import {
  CreateAppDialog,
  DeleteAppDialog,
  AppSecretDialog,
} from "@z0/app/components/applications";
import type { AppWithCounts, CreateAppResponse } from "@z0/types";
import type { CreateAppFormInput } from "@z0/validation";

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

  const [apps, setApps] = useState<AppWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSecretDialogOpen, setIsSecretDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppWithCounts | null>(null);
  const [createdAppData, setCreatedAppData] = useState<CreateAppResponse | null>(null);

  const loadApps = useCallback(async () => {
    if (!currentOrg) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await authFetch(`/api/v1/orgs/${currentOrg.id}/apps`);

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

  const handleCreateApp = async (data: CreateAppFormInput) => {
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

      const response = await authFetch(`/api/v1/orgs/${currentOrg.id}/apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          slug: data.slug,
          description: data.description || undefined,
          allowedOrigins,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to create application");
      }

      // Store created app data for secret dialog
      if (result.data?.apiSecret) {
        setCreatedAppData({
          app: result.data,
          apiKey: result.data.apiKey,
          apiSecret: result.data.apiSecret,
        });
      }

      setIsCreateDialogOpen(false);
      setIsSecretDialogOpen(true);
      await loadApps();
      toast.success("Application created successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteApp = async () => {
    if (!currentOrg || !selectedApp) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await authFetch(
        `/api/v1/orgs/${currentOrg.id}/apps/${selectedApp.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete application");
      }

      setIsDeleteDialogOpen(false);
      setSelectedApp(null);
      await loadApps();
      toast.success("Application deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteDialog = (app: AppWithCounts) => {
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
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Application
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

      {/* Create App Dialog */}
      <CreateAppDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={handleCreateApp}
        isSubmitting={isSubmitting}
      />

      {/* API Secret Dialog - One-time display */}
      <AppSecretDialog
        open={isSecretDialogOpen}
        onOpenChange={(open) => {
          setIsSecretDialogOpen(open);
          if (!open) setCreatedAppData(null);
        }}
        appData={createdAppData}
      />

      {/* Delete Confirmation */}
      <DeleteAppDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        app={selectedApp}
        onConfirm={handleDeleteApp}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
