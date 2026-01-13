import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  AlertCircle,
  Key,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Clock,
} from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@z0/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
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
import { Input } from "@z0/components/ui/input";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@z0/components/ui/badge";
import { useOrg, useOrgPermissions } from "../../../contexts/org-context";

// Create API key schema
const createApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  appId: z.string().min(1, "Select an application"),
  expiresIn: z.string().optional(),
});

type CreateApiKeyFormValues = z.infer<typeof createApiKeySchema>;

interface ApiKey {
  id: string;
  userId: string;
  appId: string;
  name: string;
  keyPrefix: string;
  status: "ACTIVE" | "ROTATING" | "DEPRECATED" | "REVOKED";
  scopes?: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CreatedApiKey extends ApiKey {
  key: string;
}

interface App {
  id: string;
  name: string;
  slug: string;
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  ACTIVE: { label: "Active", variant: "default" },
  ROTATING: { label: "Rotating", variant: "secondary" },
  DEPRECATED: { label: "Deprecated", variant: "outline" },
  REVOKED: { label: "Revoked", variant: "destructive" },
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "Never";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeDate(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return "Expired";
  } else if (diffDays === 0) {
    return "Today";
  } else if (diffDays <= 30) {
    return `${diffDays} days`;
  } else {
    return formatDate(dateString);
  }
}

export default function ApiKeysPage() {
  const { currentOrg } = useOrg();
  const { canManageApiKeys } = useOrgPermissions();

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSecretDialogOpen, setIsSecretDialogOpen] = useState(false);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const form = useForm<CreateApiKeyFormValues>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: {
      name: "",
      appId: "",
      expiresIn: "",
    },
  });

  const loadApiKeys = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/v1/users/me/api-keys", {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load API keys");
      }

      const result = await response.json();
      setApiKeys(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadApps = useCallback(async () => {
    if (!currentOrg) return;

    try {
      const response = await fetch(`/api/v1/orgs/${currentOrg.id}/apps`, {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        setApps(result.data || []);
      }
    } catch (err) {
      console.error("Failed to load apps:", err);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadApiKeys();
    loadApps();
  }, [loadApiKeys, loadApps]);

  const handleCreateApiKey = async (data: CreateApiKeyFormValues) => {
    try {
      setIsSubmitting(true);
      setError(null);

      let expiresAt: string | undefined;
      if (data.expiresIn) {
        const date = new Date();
        switch (data.expiresIn) {
          case "7d":
            date.setDate(date.getDate() + 7);
            break;
          case "30d":
            date.setDate(date.getDate() + 30);
            break;
          case "90d":
            date.setDate(date.getDate() + 90);
            break;
          case "1y":
            date.setFullYear(date.getFullYear() + 1);
            break;
        }
        expiresAt = date.toISOString();
      }

      const response = await fetch("/api/v1/users/me/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: data.name,
          appId: data.appId,
          expiresAt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create API key");
      }

      const result = await response.json();
      setCreatedKey(result.data);
      setIsCreateDialogOpen(false);
      setIsSecretDialogOpen(true);
      form.reset();
      await loadApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!selectedKey) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(`/api/v1/users/me/api-keys/${selectedKey.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to revoke API key");
      }

      setIsRevokeDialogOpen(false);
      setSelectedKey(null);
      await loadApiKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyKey = async () => {
    if (createdKey?.key) {
      await navigator.clipboard.writeText(createdKey.key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const closeSecretDialog = () => {
    setIsSecretDialogOpen(false);
    setCreatedKey(null);
    setCopiedKey(false);
  };

  const openRevokeDialog = (apiKey: ApiKey) => {
    setSelectedKey(apiKey);
    setIsRevokeDialogOpen(true);
  };

  // Get app name by ID
  const getAppName = (appId: string) => {
    const app = apps.find((a) => a.id === appId);
    return app?.name || "Unknown App";
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Manage your personal API keys for accessing Z0 Auth APIs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadApiKeys} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canManageApiKeys && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={apps.length === 0}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create API Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a new API key</DialogTitle>
                  <DialogDescription>
                    Generate a new API key for accessing Z0 Auth APIs
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(handleCreateApiKey)}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Key name</FormLabel>
                          <FormControl>
                            <Input placeholder="Production API Key" {...field} />
                          </FormControl>
                          <FormDescription>
                            A descriptive name to identify this key
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="appId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Application</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select an application" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {apps.map((app) => (
                                <SelectItem key={app.id} value={app.id}>
                                  {app.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            The application this key will be scoped to
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expiresIn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expiration (optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="No expiration" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="7d">7 days</SelectItem>
                              <SelectItem value="30d">30 days</SelectItem>
                              <SelectItem value="90d">90 days</SelectItem>
                              <SelectItem value="1y">1 year</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            When the key should automatically expire
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
                        Create API Key
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {apps.length === 0 && !isLoading && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No applications</AlertTitle>
          <AlertDescription>
            You need to create an application before you can generate API keys.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            API keys are used to authenticate API requests. Keep them secure and never
            share them publicly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No API keys yet</p>
              <p className="text-sm mt-2">
                Create an API key to start making authenticated requests
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Application</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Expires</TableHead>
                  {canManageApiKeys && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((apiKey) => {
                  const status = statusConfig[apiKey.status] || statusConfig.ACTIVE;
                  return (
                    <TableRow key={apiKey.id}>
                      <TableCell className="font-medium">{apiKey.name}</TableCell>
                      <TableCell>
                        <code className="bg-muted px-2 py-1 rounded text-sm">
                          {apiKey.keyPrefix}...
                        </code>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {getAppName(apiKey.appId)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(apiKey.lastUsedAt)}
                      </TableCell>
                      <TableCell>
                        {apiKey.expiresAt ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatRelativeDate(apiKey.expiresAt)}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      {canManageApiKeys && (
                        <TableCell className="text-right">
                          {apiKey.status === "ACTIVE" && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => openRevokeDialog(apiKey)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Revoke key
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
          )}
        </CardContent>
      </Card>

      {/* API Key Secret Dialog - One-time display */}
      <Dialog open={isSecretDialogOpen} onOpenChange={closeSecretDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>API key created successfully</DialogTitle>
            <DialogDescription>
              Copy your API key now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Save this key securely</AlertTitle>
            <AlertDescription>
              This is the only time you'll see this API key. Store it in a secure
              location like a password manager. If you lose it, you'll need to create a
              new one.
            </AlertDescription>
          </Alert>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">API Key</label>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 p-3 bg-muted rounded-md font-mono text-sm break-all select-all">
                  {createdKey?.key}
                </div>
                <Button variant="outline" size="icon" onClick={copyKey}>
                  {copiedKey ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={closeSecretDialog}>I've saved the key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation */}
      <AlertDialog open={isRevokeDialogOpen} onOpenChange={setIsRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the API key "{selectedKey?.name}"? This
              action cannot be undone and any applications using this key will stop
              working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeKey}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
