import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  AlertCircle,
  Webhook,
  MoreHorizontal,
  Edit2,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Play,
  Power,
  PowerOff,
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
import { Checkbox } from "@z0/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@z0/components/ui/badge";
import { useOrg, useOrgPermissions } from "../../../contexts/org-context";

const EVENT_TYPES = [
  { value: "user.created", label: "User Created" },
  { value: "user.updated", label: "User Updated" },
  { value: "user.deleted", label: "User Deleted" },
  { value: "user.login", label: "User Login" },
  { value: "user.logout", label: "User Logout" },
  { value: "member.added", label: "Member Added" },
  { value: "member.removed", label: "Member Removed" },
  { value: "app.created", label: "App Created" },
  { value: "session.created", label: "Session Created" },
  { value: "security.lockout", label: "Security Lockout" },
];

const createWebhookSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  url: z.string().url("Enter a valid URL"),
  eventTypes: z.array(z.string()).min(1, "Select at least one event type"),
  description: z.string().max(500).optional(),
});

type CreateWebhookFormValues = z.infer<typeof createWebhookSchema>;

interface WebhookType {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  eventTypes: string[];
  description: string | null;
  eventCount: number;
  createdAt: string;
}

interface CreatedWebhook extends WebhookType {
  secret: string;
}

export default function WebhooksPage() {
  const { currentOrg } = useOrg();
  const { canManageWebhooks } = useOrgPermissions();

  const [webhooks, setWebhooks] = useState<WebhookType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSecretDialogOpen, setIsSecretDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookType | null>(null);
  const [createdWebhook, setCreatedWebhook] = useState<CreatedWebhook | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const form = useForm<CreateWebhookFormValues>({
    resolver: zodResolver(createWebhookSchema),
    defaultValues: {
      name: "",
      url: "",
      eventTypes: [],
      description: "",
    },
  });

  const loadWebhooks = useCallback(async () => {
    if (!currentOrg) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/orgs/${currentOrg.id}/webhooks`, {
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load webhooks");
      }

      const result = await response.json();
      setWebhooks(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  const handleCreateWebhook = async (data: CreateWebhookFormValues) => {
    if (!currentOrg) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(`/api/v1/orgs/${currentOrg.id}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create webhook");
      }

      const result = await response.json();
      setCreatedWebhook(result.data);
      setIsCreateDialogOpen(false);
      setIsSecretDialogOpen(true);
      form.reset();
      await loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWebhook = async () => {
    if (!currentOrg || !selectedWebhook) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/webhooks/${selectedWebhook.id}`,
        { method: "DELETE", credentials: "include" }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete webhook");
      }

      setIsDeleteDialogOpen(false);
      setSelectedWebhook(null);
      await loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestWebhook = async (webhook: WebhookType) => {
    if (!currentOrg) return;

    try {
      setError(null);
      const response = await fetch(
        `/api/v1/orgs/${currentOrg.id}/webhooks/${webhook.id}/test`,
        { method: "POST", credentials: "include" }
      );

      const result = await response.json();
      if (result.data?.delivered) {
        alert("Test webhook delivered successfully!");
      } else {
        alert(`Test failed: ${result.data?.errorMessage || "Unknown error"}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const copySecret = async () => {
    if (createdWebhook?.secret) {
      await navigator.clipboard.writeText(createdWebhook.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  const closeSecretDialog = () => {
    setIsSecretDialogOpen(false);
    setCreatedWebhook(null);
    setCopiedSecret(false);
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-muted-foreground mt-1">
            Configure webhooks to receive event notifications
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadWebhooks} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canManageWebhooks && (
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Webhook
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create a new webhook</DialogTitle>
                  <DialogDescription>
                    Configure a webhook to receive event notifications
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleCreateWebhook)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Webhook name</FormLabel>
                          <FormControl>
                            <Input placeholder="Production Events" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Endpoint URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://api.example.com/webhooks" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="eventTypes"
                      render={() => (
                        <FormItem>
                          <FormLabel>Events to subscribe</FormLabel>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            {EVENT_TYPES.map((event) => (
                              <FormField
                                key={event.value}
                                control={form.control}
                                name="eventTypes"
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(event.value)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            field.onChange([...field.value, event.value]);
                                          } else {
                                            field.onChange(
                                              field.value?.filter((v) => v !== event.value)
                                            );
                                          }
                                        }}
                                      />
                                    </FormControl>
                                    <FormLabel className="text-sm font-normal">
                                      {event.label}
                                    </FormLabel>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>
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
                            <Textarea className="resize-none" rows={2} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Webhook
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
          <CardTitle>Configured Webhooks</CardTitle>
          <CardDescription>
            Webhooks send HTTP POST requests when events occur
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : webhooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No webhooks configured</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deliveries</TableHead>
                  {canManageWebhooks && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((webhook) => (
                  <TableRow key={webhook.id}>
                    <TableCell className="font-medium">{webhook.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {webhook.url}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{webhook.eventTypes.length} events</Badge>
                    </TableCell>
                    <TableCell>
                      {webhook.isActive ? (
                        <Badge variant="default" className="gap-1">
                          <Power className="h-3 w-3" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <PowerOff className="h-3 w-3" /> Disabled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{webhook.eventCount}</TableCell>
                    {canManageWebhooks && (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleTestWebhook(webhook)}>
                              <Play className="mr-2 h-4 w-4" />
                              Send test
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setSelectedWebhook(webhook);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
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

      {/* Secret Dialog */}
      <Dialog open={isSecretDialogOpen} onOpenChange={closeSecretDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Webhook created successfully</DialogTitle>
            <DialogDescription>Copy your webhook secret now</DialogDescription>
          </DialogHeader>
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Save this secret</AlertTitle>
            <AlertDescription>
              Use this secret to verify webhook signatures. It won't be shown again.
            </AlertDescription>
          </Alert>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium">Webhook Secret</label>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 p-3 bg-muted rounded-md font-mono text-sm break-all">
                  {createdWebhook?.secret}
                </div>
                <Button variant="outline" size="icon" onClick={copySecret}>
                  {copiedSecret ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={closeSecretDialog}>I've saved the secret</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete webhook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedWebhook?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWebhook}
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
