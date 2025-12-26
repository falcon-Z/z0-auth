import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  AlertCircle,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  TestTube,
  CheckCircle,
  XCircle,
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
import { Switch } from "@z0/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@z0/components/ui/badge";
import { useOrg, useOrgPermissions } from "../../../contexts/org-context";

const PROVIDERS = [
  { value: "GOOGLE", label: "Google", type: "OAUTH2" },
  { value: "GITHUB", label: "GitHub", type: "OAUTH2" },
  { value: "MICROSOFT", label: "Microsoft", type: "OAUTH2" },
  { value: "FACEBOOK", label: "Facebook", type: "OAUTH2" },
  { value: "LINKEDIN", label: "LinkedIn", type: "OAUTH2" },
  { value: "TWITTER", label: "Twitter/X", type: "OAUTH2" },
  { value: "DISCORD", label: "Discord", type: "OAUTH2" },
  { value: "SLACK", label: "Slack", type: "OAUTH2" },
  { value: "OKTA", label: "Okta", type: "OIDC" },
  { value: "AUTH0", label: "Auth0", type: "OIDC" },
  { value: "AZURE_AD", label: "Azure AD", type: "OIDC" },
];

const createProviderSchema = z.object({
  provider: z.string().min(1, "Select a provider"),
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
  redirectUri: z.string().url("Enter a valid redirect URI"),
  autoProvision: z.boolean().default(false),
});

type CreateProviderFormValues = z.infer<typeof createProviderSchema>;

interface Provider {
  id: string;
  provider: string;
  providerType: string;
  isEnabled: boolean;
  clientId: string | null;
  redirectUri: string | null;
  autoProvision: boolean;
  createdAt: string;
}

export default function ProvidersPage() {
  const { currentOrg } = useOrg();
  const { canManageSettings } = useOrgPermissions();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const form = useForm<CreateProviderFormValues>({
    resolver: zodResolver(createProviderSchema),
    defaultValues: {
      provider: "",
      clientId: "",
      clientSecret: "",
      redirectUri: "",
      autoProvision: false,
    },
  });

  const loadProviders = useCallback(async () => {
    if (!currentOrg) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/orgs/${currentOrg.id}/providers`, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load providers");
      }

      const result = await response.json();
      setProviders(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleCreateProvider = async (data: CreateProviderFormValues) => {
    if (!currentOrg) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const providerInfo = PROVIDERS.find((p) => p.value === data.provider);

      const response = await fetch(`/api/v1/orgs/${currentOrg.id}/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: data.provider,
          providerType: providerInfo?.type || "OAUTH2",
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          redirectUri: data.redirectUri,
          autoProvision: data.autoProvision,
          scopes: ["openid", "email", "profile"],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create provider");
      }

      setIsCreateDialogOpen(false);
      form.reset();
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleProvider = async (provider: Provider) => {
    if (!currentOrg) return;

    try {
      setError(null);

      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/providers/${provider.id}/toggle`,
        { method: "PATCH", credentials: "include" }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to toggle provider");
      }

      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const handleTestProvider = async (provider: Provider) => {
    if (!currentOrg) return;

    try {
      setTestResult(null);
      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/providers/${provider.id}/test`,
        { method: "POST", credentials: "include" }
      );

      const result = await response.json();
      setTestResult({
        success: result.data?.testResults?.success || false,
        message: result.data?.testResults?.success
          ? "Configuration is valid"
          : "Configuration has issues",
      });
      setTimeout(() => setTestResult(null), 3000);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Test failed",
      });
    }
  };

  const handleDeleteProvider = async () => {
    if (!currentOrg || !selectedProvider) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/providers/${selectedProvider.id}`,
        { method: "DELETE", credentials: "include" }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete provider");
      }

      setIsDeleteDialogOpen(false);
      setSelectedProvider(null);
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getProviderLabel = (provider: string) => {
    return PROVIDERS.find((p) => p.value === provider)?.label || provider;
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">OAuth Providers</h1>
          <p className="text-muted-foreground mt-1">
            Configure external authentication providers
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadProviders} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canManageSettings && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Provider
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add OAuth Provider</DialogTitle>
                  <DialogDescription>
                    Configure a new authentication provider
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleCreateProvider)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="provider"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provider</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a provider" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PROVIDERS.map((p) => (
                                <SelectItem key={p.value} value={p.value}>
                                  {p.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="clientId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client ID</FormLabel>
                          <FormControl>
                            <Input placeholder="your-client-id" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="clientSecret"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Secret</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="your-client-secret" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="redirectUri"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Redirect URI</FormLabel>
                          <FormControl>
                            <Input placeholder="https://your-app.com/callback" {...field} />
                          </FormControl>
                          <FormDescription>
                            The callback URL configured in your OAuth app
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="autoProvision"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Auto-provision users</FormLabel>
                            <FormDescription>
                              Automatically create accounts for new users
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add Provider
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {testResult && (
        <Alert variant={testResult.success ? "default" : "destructive"}>
          {testResult.success ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertDescription>{testResult.message}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : providers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Power className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No providers configured</h3>
            <p className="text-muted-foreground text-center mb-4">
              Add OAuth providers to enable social login
            </p>
            {canManageSettings && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Provider
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <Card key={provider.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {getProviderLabel(provider.provider)}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {provider.providerType}
                    </CardDescription>
                  </div>
                  {canManageSettings && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleTestProvider(provider)}>
                          <TestTube className="mr-2 h-4 w-4" />
                          Test configuration
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleProvider(provider)}>
                          {provider.isEnabled ? (
                            <>
                              <PowerOff className="mr-2 h-4 w-4" />
                              Disable
                            </>
                          ) : (
                            <>
                              <Power className="mr-2 h-4 w-4" />
                              Enable
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setSelectedProvider(provider);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    {provider.isEnabled ? (
                      <Badge variant="default">Enabled</Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Auto-provision</span>
                    <span>{provider.autoProvision ? "Yes" : "No"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete provider</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {getProviderLabel(selectedProvider?.provider || "")}?
              Users who signed in with this provider may lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProvider}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
