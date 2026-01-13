/**
 * API Key dialogs
 * Create and revoke API key dialogs
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog, DeleteConfirmDialog } from "@z0/app/components/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { Button } from "@z0/components/ui/button";
import { Copy, Check, AlertTriangle } from "lucide-react";
import type { ApiKey } from "./api-key-columns";

// Validation schema for creating API key
const createApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  scopes: z.array(z.string()).min(1, "Select at least one scope"),
  expiresIn: z.enum(["7d", "30d", "90d", "365d", "never"]),
});

type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

// Available scopes - can be customized per implementation
const availableScopes = [
  { value: "read:users", label: "Read Users", description: "View user information" },
  { value: "write:users", label: "Write Users", description: "Create and update users" },
  { value: "read:apps", label: "Read Applications", description: "View application details" },
  { value: "write:apps", label: "Write Applications", description: "Manage applications" },
  { value: "read:orgs", label: "Read Organizations", description: "View organization data" },
  { value: "write:orgs", label: "Write Organizations", description: "Manage organizations" },
];

const expirationOptions = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "365d", label: "1 year" },
  { value: "never", label: "Never expires" },
];

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateApiKeyInput) => Promise<{ key: string } | void>;
  isSubmitting?: boolean;
  customScopes?: { value: string; label: string; description?: string }[];
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
  customScopes,
}: CreateApiKeyDialogProps) {
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scopes = customScopes || availableScopes;

  const form = useForm<CreateApiKeyInput>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: {
      name: "",
      scopes: [],
      expiresIn: "30d",
    },
  });

  const handleSubmit = async (data: CreateApiKeyInput) => {
    const result = await onSubmit(data);
    if (result?.key) {
      setGeneratedKey(result.key);
    } else {
      form.reset();
      onOpenChange(false);
    }
  };

  const handleCopy = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setGeneratedKey(null);
    setCopied(false);
    form.reset();
    onOpenChange(false);
  };

  // Show key display dialog after creation
  if (generatedKey) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Save Your API Key
            </DialogTitle>
            <DialogDescription>
              This is the only time you'll see this key. Copy it now and store it securely.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm break-all">
              <code className="flex-1">{generatedKey}</code>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Store this key in a secure location. You won't be able to see it again.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={handleClose}
      title="Create API Key"
      description="Generate a new API key for programmatic access."
      onSubmit={form.handleSubmit(handleSubmit)}
      isSubmitting={isSubmitting}
      submitLabel="Create Key"
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
                    placeholder="My API Key"
                    {...field}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormDescription>
                  A descriptive name to identify this key.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="scopes"
            render={() => (
              <FormItem>
                <FormLabel>Scopes</FormLabel>
                <FormDescription>
                  Select the permissions for this API key.
                </FormDescription>
                <div className="space-y-2 mt-2">
                  {scopes.map((scope) => (
                    <FormField
                      key={scope.value}
                      control={form.control}
                      name="scopes"
                      render={({ field }) => (
                        <FormItem className="flex items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(scope.value)}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                if (checked) {
                                  field.onChange([...current, scope.value]);
                                } else {
                                  field.onChange(
                                    current.filter((v) => v !== scope.value)
                                  );
                                }
                              }}
                              disabled={isSubmitting}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="font-normal cursor-pointer">
                              {scope.label}
                            </FormLabel>
                            {scope.description && (
                              <p className="text-xs text-muted-foreground">
                                {scope.description}
                              </p>
                            )}
                          </div>
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
            name="expiresIn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expiration</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isSubmitting}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select expiration" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {expirationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Form>
    </FormDialog>
  );
}

interface RevokeApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: ApiKey | null;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function RevokeApiKeyDialog({
  open,
  onOpenChange,
  apiKey,
  onConfirm,
  isSubmitting = false,
}: RevokeApiKeyDialogProps) {
  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      itemType="API key"
      itemName={apiKey?.name}
      onConfirm={onConfirm}
      isLoading={isSubmitting}
      confirmLabel="Revoke Key"
      description="This will immediately revoke the API key. Any applications using this key will no longer be able to authenticate."
    />
  );
}

export type { CreateApiKeyDialogProps, RevokeApiKeyDialogProps, CreateApiKeyInput };
