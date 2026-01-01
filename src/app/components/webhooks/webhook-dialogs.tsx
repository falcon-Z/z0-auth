/**
 * Webhook dialogs
 * Create, edit, and delete webhook dialogs
 */

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog, DeleteConfirmDialog, ConfirmDialog } from "@z0/app/components/shared";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@z0/components/ui/form";
import { Input } from "@z0/components/ui/input";
import { Checkbox } from "@z0/components/ui/checkbox";
import { Button } from "@z0/components/ui/button";
import { Copy, Check, RefreshCw } from "lucide-react";
import type { Webhook } from "./webhook-columns";

// Validation schema for webhooks
const webhookSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  url: z.string().url("Must be a valid URL"),
  events: z.array(z.string()).min(1, "Select at least one event"),
  secret: z.string().optional(),
});

type WebhookInput = z.infer<typeof webhookSchema>;

// Available webhook events - can be customized per implementation
const availableEvents = [
  { value: "user.created", label: "User Created", category: "Users" },
  { value: "user.updated", label: "User Updated", category: "Users" },
  { value: "user.deleted", label: "User Deleted", category: "Users" },
  { value: "user.login", label: "User Login", category: "Users" },
  { value: "user.logout", label: "User Logout", category: "Users" },
  { value: "org.created", label: "Organization Created", category: "Organizations" },
  { value: "org.updated", label: "Organization Updated", category: "Organizations" },
  { value: "org.deleted", label: "Organization Deleted", category: "Organizations" },
  { value: "member.added", label: "Member Added", category: "Members" },
  { value: "member.removed", label: "Member Removed", category: "Members" },
  { value: "member.role_changed", label: "Member Role Changed", category: "Members" },
  { value: "app.created", label: "Application Created", category: "Applications" },
  { value: "app.updated", label: "Application Updated", category: "Applications" },
  { value: "app.deleted", label: "Application Deleted", category: "Applications" },
];

// Group events by category
const eventsByCategory = availableEvents.reduce(
  (acc, event) => {
    if (!acc[event.category]) {
      acc[event.category] = [];
    }
    acc[event.category].push(event);
    return acc;
  },
  {} as Record<string, typeof availableEvents>
);

// Generate a random webhook secret
function generateSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface CreateWebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: WebhookInput) => void | Promise<void>;
  isSubmitting?: boolean;
  customEvents?: { value: string; label: string; category?: string }[];
}

export function CreateWebhookDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
  customEvents,
}: CreateWebhookDialogProps) {
  const [copied, setCopied] = useState(false);

  const form = useForm<WebhookInput>({
    resolver: zodResolver(webhookSchema),
    defaultValues: {
      name: "",
      url: "",
      events: [],
      secret: generateSecret(),
    },
  });

  const handleSubmit = async (data: WebhookInput) => {
    await onSubmit(data);
    form.reset({ ...form.formState.defaultValues, secret: generateSecret() });
  };

  const handleCopySecret = async () => {
    const secret = form.getValues("secret");
    if (secret) {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRegenerateSecret = () => {
    form.setValue("secret", generateSecret());
  };

  const events = customEvents || availableEvents;
  const groupedEvents = customEvents
    ? events.reduce(
        (acc, event) => {
          const category = event.category || "General";
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(event);
          return acc;
        },
        {} as Record<string, typeof events>
      )
    : eventsByCategory;

  return (
    <FormDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          form.reset({ ...form.formState.defaultValues, secret: generateSecret() });
        }
        onOpenChange(isOpen);
      }}
      title="Create Webhook"
      description="Configure a webhook to receive event notifications."
      onSubmit={form.handleSubmit(handleSubmit)}
      isSubmitting={isSubmitting}
      submitLabel="Create Webhook"
    >
      <Form {...form}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="My Webhook"
                    {...field}
                    disabled={isSubmitting}
                  />
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
                  <Input
                    type="url"
                    placeholder="https://example.com/webhooks"
                    {...field}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormDescription>
                  The URL where webhook events will be sent.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="secret"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Signing Secret</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isSubmitting}
                      className="font-mono text-xs"
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopySecret}
                    disabled={isSubmitting}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleRegenerateSecret}
                    disabled={isSubmitting}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <FormDescription>
                  Used to verify webhook payloads. Save this securely.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="events"
            render={() => (
              <FormItem>
                <FormLabel>Events</FormLabel>
                <FormDescription>
                  Select the events you want to receive.
                </FormDescription>
                <div className="space-y-4 mt-2 max-h-48 overflow-y-auto">
                  {Object.entries(groupedEvents).map(([category, categoryEvents]) => (
                    <div key={category} className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        {category}
                      </h4>
                      <div className="space-y-2 pl-2">
                        {categoryEvents.map((event) => (
                          <FormField
                            key={event.value}
                            control={form.control}
                            name="events"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(event.value)}
                                    onCheckedChange={(checked) => {
                                      const current = field.value || [];
                                      if (checked) {
                                        field.onChange([...current, event.value]);
                                      } else {
                                        field.onChange(
                                          current.filter((v) => v !== event.value)
                                        );
                                      }
                                    }}
                                    disabled={isSubmitting}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">
                                  {event.label}
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Form>
    </FormDialog>
  );
}

interface EditWebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: Webhook | null;
  onSubmit: (data: WebhookInput) => void | Promise<void>;
  isSubmitting?: boolean;
  customEvents?: { value: string; label: string; category?: string }[];
}

export function EditWebhookDialog({
  open,
  onOpenChange,
  webhook,
  onSubmit,
  isSubmitting = false,
  customEvents,
}: EditWebhookDialogProps) {
  const form = useForm<WebhookInput>({
    resolver: zodResolver(webhookSchema),
    defaultValues: {
      name: "",
      url: "",
      events: [],
      secret: "",
    },
  });

  // Reset form when webhook changes
  useEffect(() => {
    if (webhook) {
      form.reset({
        name: webhook.name,
        url: webhook.url,
        events: webhook.events || [],
        secret: webhook.secret || "",
      });
    }
  }, [webhook, form]);

  const handleSubmit = async (data: WebhookInput) => {
    await onSubmit(data);
  };

  const events = customEvents || availableEvents;
  const groupedEvents = customEvents
    ? events.reduce(
        (acc, event) => {
          const category = event.category || "General";
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(event);
          return acc;
        },
        {} as Record<string, typeof events>
      )
    : eventsByCategory;

  if (!webhook) return null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Webhook"
      description={`Update the "${webhook.name}" webhook.`}
      onSubmit={form.handleSubmit(handleSubmit)}
      isSubmitting={isSubmitting}
      submitLabel="Save Changes"
    >
      <Form {...form}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="My Webhook"
                    {...field}
                    disabled={isSubmitting}
                  />
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
                  <Input
                    type="url"
                    placeholder="https://example.com/webhooks"
                    {...field}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="events"
            render={() => (
              <FormItem>
                <FormLabel>Events</FormLabel>
                <div className="space-y-4 mt-2 max-h-48 overflow-y-auto">
                  {Object.entries(groupedEvents).map(([category, categoryEvents]) => (
                    <div key={category} className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        {category}
                      </h4>
                      <div className="space-y-2 pl-2">
                        {categoryEvents.map((event) => (
                          <FormField
                            key={event.value}
                            control={form.control}
                            name="events"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(event.value)}
                                    onCheckedChange={(checked) => {
                                      const current = field.value || [];
                                      if (checked) {
                                        field.onChange([...current, event.value]);
                                      } else {
                                        field.onChange(
                                          current.filter((v) => v !== event.value)
                                        );
                                      }
                                    }}
                                    disabled={isSubmitting}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">
                                  {event.label}
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Form>
    </FormDialog>
  );
}

interface DeleteWebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: Webhook | null;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function DeleteWebhookDialog({
  open,
  onOpenChange,
  webhook,
  onConfirm,
  isSubmitting = false,
}: DeleteWebhookDialogProps) {
  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      itemType="webhook"
      itemName={webhook?.name}
      onConfirm={onConfirm}
      isLoading={isSubmitting}
      description="This webhook will stop receiving events immediately."
    />
  );
}

interface TestWebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: Webhook | null;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function TestWebhookDialog({
  open,
  onOpenChange,
  webhook,
  onConfirm,
  isSubmitting = false,
}: TestWebhookDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Send Test Webhook"
      description={`Send a test event to "${webhook?.name}" at ${webhook?.url}?`}
      onConfirm={onConfirm}
      isLoading={isSubmitting}
      confirmLabel="Send Test"
      variant="default"
    />
  );
}

export type {
  CreateWebhookDialogProps,
  EditWebhookDialogProps,
  DeleteWebhookDialogProps,
  TestWebhookDialogProps,
  WebhookInput,
};
