/**
 * AddMemberDialog component
 * Full-featured dialog for adding members to an organization
 * with email lookup, invite vs create modes, and proper state management
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Mail,
  UserCog,
  Copy,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@z0/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
import { Input } from "@z0/components/ui/input";
import { Button } from "@z0/components/ui/button";
import { Alert, AlertDescription } from "@z0/components/ui/alert";
import { authFetch } from "@z0/utils/api/client";
import { ORG_ROLE_LABELS, type OrgRoleType } from "@z0/types";

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Schema for add member form
const addMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().max(100, "Name is too long").optional(),
  roleType: z.enum(["ORG_OWNER", "ORG_ADMIN", "ORG_DEVELOPER", "ORG_MEMBER"]),
});

type AddMemberFormValues = z.infer<typeof addMemberSchema>;

// User lookup result type
interface UserLookupResult {
  exists: boolean;
  data: {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    status: string;
  } | null;
  isMember: boolean;
  membershipInactive: boolean;
}

// Invitation result for mailto fallback
interface InvitationResult {
  email: string;
  inviteUrl: string;
  emailSent: boolean;
  emailContent?: { subject: string; body: string };
}

// Credentials result for new user creation
interface CredentialsResult {
  email: string;
  name: string;
  tempPassword: string;
}

const ROLE_OPTIONS: { value: OrgRoleType; label: string; description: string }[] = [
  { value: "ORG_OWNER", label: ORG_ROLE_LABELS.ORG_OWNER, description: "Full access to organization" },
  { value: "ORG_ADMIN", label: ORG_ROLE_LABELS.ORG_ADMIN, description: "Manage members and settings" },
  { value: "ORG_DEVELOPER", label: ORG_ROLE_LABELS.ORG_DEVELOPER, description: "Access to apps and APIs" },
  { value: "ORG_MEMBER", label: ORG_ROLE_LABELS.ORG_MEMBER, description: "Basic access only" },
];

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onSuccess?: () => void;
}

export function AddMemberDialog({
  open,
  onOpenChange,
  organizationId,
  onSuccess,
}: AddMemberDialogProps) {
  // State
  const [userLookup, setUserLookup] = useState<UserLookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [addMemberMode, setAddMemberMode] = useState<"invite" | "manual">("invite");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationResult, setInvitationResult] = useState<InvitationResult | null>(null);
  const [credentialsResult, setCredentialsResult] = useState<CredentialsResult | null>(null);

  // Form
  const form = useForm<AddMemberFormValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      email: "",
      name: "",
      roleType: "ORG_MEMBER",
    },
  });

  const emailValue = form.watch("email");
  const debouncedEmail = useDebounce(emailValue, 500);

  // Reset dialog state
  const resetDialog = useCallback(() => {
    form.reset();
    setUserLookup(null);
    setError(null);
    setAddMemberMode("invite");
    setInvitationResult(null);
    setCredentialsResult(null);
    setIsLookingUp(false);
    setIsSubmitting(false);
  }, [form]);

  // Lookup user by email
  const lookupUserByEmail = useCallback(async (email: string) => {
    if (!organizationId || !email) {
      setUserLookup(null);
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setUserLookup(null);
      return;
    }

    try {
      setIsLookingUp(true);
      const response = await authFetch(
        `/api/v1/orgs/${organizationId}/members/lookup?email=${encodeURIComponent(email)}`
      );

      if (response.ok) {
        const result = await response.json();
        setUserLookup(result);

        // If user exists, populate name field
        if (result.exists && result.data) {
          form.setValue("name", result.data.name, { shouldValidate: true });
        }
      }
    } catch (err) {
      console.error("User lookup failed:", err);
    } finally {
      setIsLookingUp(false);
    }
  }, [organizationId, form]);

  // Effect for debounced email lookup
  useEffect(() => {
    if (debouncedEmail && open) {
      lookupUserByEmail(debouncedEmail);
    } else if (!debouncedEmail) {
      setUserLookup(null);
    }
  }, [debouncedEmail, open, lookupUserByEmail]);

  // Close handler
  const handleClose = useCallback(() => {
    resetDialog();
    onOpenChange(false);
  }, [resetDialog, onOpenChange]);

  // Compute button disabled state
  const isAddButtonDisabled = useMemo(() => {
    if (isSubmitting) return true;
    if (isLookingUp) return true;
    if (!userLookup) return true;
    if (userLookup.isMember) return true;
    // Manual mode requires name
    if (!userLookup.exists && addMemberMode === "manual") {
      const name = form.getValues("name");
      if (!name?.trim()) return true;
    }
    return false;
  }, [isSubmitting, isLookingUp, userLookup, addMemberMode, form]);

  // Submit handler
  const handleSubmit = async (data: AddMemberFormValues) => {
    if (!organizationId) return;

    // Validate: if user doesn't exist and manual mode, require name
    if (!userLookup?.exists && addMemberMode === "manual") {
      if (!data.name || data.name.trim() === "") {
        setError("Name is required for new users");
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setError(null);

      let response: Response;

      if (userLookup?.exists) {
        // User exists - add directly to organization
        response = await authFetch(`/api/v1/orgs/${organizationId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.email,
            name: userLookup.data?.name || data.name,
            roleType: data.roleType,
          }),
        });
      } else if (addMemberMode === "invite") {
        // New user - send invitation
        response = await authFetch(`/api/v1/orgs/${organizationId}/invitations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.email,
            roleType: data.roleType,
          }),
        });
      } else {
        // Manual mode - create user with auto-generated password
        response = await authFetch(`/api/v1/orgs/${organizationId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.email,
            name: data.name,
            roleType: data.roleType,
          }),
        });
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || "Failed to add member");
      }

      // Handle invitation result (for mailto fallback)
      if (addMemberMode === "invite" && result.data) {
        if (!result.data.emailSent && result.data.emailContent) {
          setInvitationResult({
            email: data.email,
            inviteUrl: result.data.inviteUrl,
            emailSent: false,
            emailContent: result.data.emailContent,
          });
          onSuccess?.();
          return; // Don't close yet, show mailto dialog
        }
      }

      // Handle manual creation result (show temp password)
      if (addMemberMode === "manual" && result.data?.credentials) {
        setCredentialsResult({
          email: data.email,
          name: data.name || "",
          tempPassword: result.data.credentials.tempPassword,
        });
        onSuccess?.();
        return; // Don't close yet, show credentials dialog
      }

      // Success - close and refresh
      onSuccess?.();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get button text
  const getButtonText = () => {
    if (isLookingUp) return "Checking...";
    if (!userLookup) return "Enter Email";
    if (userLookup.isMember) return "Already a Member";
    if (userLookup.exists) return "Add to Organization";
    return addMemberMode === "invite" ? "Send Invite" : "Create & Add";
  };

  // Render invitation result dialog
  if (invitationResult) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitation Created</DialogTitle>
            <DialogDescription>
              Email delivery is not configured. You can share the invitation manually.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-sm font-medium mb-2">Share this invite link:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-background p-2 rounded truncate">
                  {invitationResult.inviteUrl}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(invitationResult.inviteUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  if (invitationResult.emailContent) {
                    const { subject, body } = invitationResult.emailContent;
                    window.open(
                      `mailto:${invitationResult.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
                    );
                  }
                }}
              >
                <Mail className="mr-2 h-4 w-4" />
                Open Email Client
              </Button>
              <Button variant="outline" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Render credentials result dialog
  if (credentialsResult) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>User Created</DialogTitle>
            <DialogDescription>
              Share these credentials with the new user. They must change their password on first login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This password will only be shown once. Make sure to copy it now.
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p className="font-mono">{credentialsResult.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Name</p>
                <p>{credentialsResult.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Temporary Password</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted p-2 rounded font-mono">
                    {credentialsResult.tempPassword}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(credentialsResult.tempPassword)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Main add member form dialog
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>
            Add a member to this organization by email.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit, (errors) => {
              const firstError = Object.values(errors)[0];
              if (firstError?.message) {
                setError(firstError.message as string);
              }
            })}
            className="space-y-4"
          >
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Email field with lookup */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder="user@example.com"
                        type="email"
                        {...field}
                      />
                      {isLookingUp && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Initial state - before lookup */}
            {!userLookup && !isLookingUp && emailValue && (
              <div className="text-sm text-muted-foreground py-2">
                Enter a valid email address to check if the user exists
              </div>
            )}

            {/* User lookup result */}
            {userLookup && (
              <div className="rounded-lg border p-3">
                {userLookup.exists && userLookup.data ? (
                  userLookup.isMember ? (
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">This user is already a member of this organization</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-medium">User found</span>
                      </div>
                      <div className="flex items-center gap-3 pl-6">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                          {userLookup.data.name?.charAt(0).toUpperCase() || "?"}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{userLookup.data.name}</p>
                          <p className="text-xs text-muted-foreground">{userLookup.data.email}</p>
                        </div>
                      </div>
                      {userLookup.membershipInactive && (
                        <p className="text-xs text-muted-foreground pl-6">
                          Previous membership will be reactivated
                        </p>
                      )}
                    </div>
                  )
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span className="text-sm">No existing user found with this email</span>
                    </div>
                    {/* Mode selection for new user */}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={addMemberMode === "invite" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setAddMemberMode("invite")}
                      >
                        <Mail className="mr-2 h-3 w-3" />
                        Send Invite
                      </Button>
                      <Button
                        type="button"
                        variant={addMemberMode === "manual" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setAddMemberMode("manual")}
                      >
                        <UserCog className="mr-2 h-3 w-3" />
                        Create Manually
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Name field - only show for manual creation of new users */}
            {userLookup && !userLookup.exists && addMemberMode === "manual" && (
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormDescription>
                      A temporary password will be auto-generated. User must change it on first login.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Role selection */}
            <FormField
              control={form.control}
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
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isAddButtonDisabled}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {getButtonText()}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export type { AddMemberDialogProps };
