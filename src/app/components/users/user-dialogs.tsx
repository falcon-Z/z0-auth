/**
 * Platform user dialogs
 * Grant access, edit role, and revoke dialogs
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
import {
  createPlatformUserSchema,
  updatePlatformUserSchema,
  type CreatePlatformUserInput,
  type UpdatePlatformUserInput,
} from "@z0/validation";
import { PLATFORM_ROLE_LABELS, type PlatformRoleType } from "@z0/types";
import type { PlatformUser } from "./user-columns";

interface GrantAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreatePlatformUserInput) => void | Promise<void>;
  isSubmitting?: boolean;
}

const roleOptions: { value: PlatformRoleType; label: string; description: string }[] = [
  { value: "SUPER_ADMIN", label: PLATFORM_ROLE_LABELS.SUPER_ADMIN, description: "Full platform access" },
  { value: "ORG_MANAGER", label: PLATFORM_ROLE_LABELS.ORG_MANAGER, description: "Manage organizations" },
  { value: "SECURITY_MANAGER", label: PLATFORM_ROLE_LABELS.SECURITY_MANAGER, description: "Security settings" },
  { value: "AUDITOR", label: PLATFORM_ROLE_LABELS.AUDITOR, description: "View-only audit access" },
  { value: "SUPPORT_MANAGER", label: PLATFORM_ROLE_LABELS.SUPPORT_MANAGER, description: "User support access" },
];

export function GrantAccessDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}: GrantAccessDialogProps) {
  const form = useForm<CreatePlatformUserInput>({
    resolver: zodResolver(createPlatformUserSchema),
    defaultValues: {
      email: "",
      name: "",
      password: "",
      roleType: "SUPPORT_MANAGER",
    },
  });

  const handleSubmit = async (data: CreatePlatformUserInput) => {
    await onSubmit(data);
    form.reset();
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Grant Platform Access"
      description="Add a new platform administrator or manager."
      onSubmit={form.handleSubmit(handleSubmit)}
      isSubmitting={isSubmitting}
      submitLabel="Grant Access"
    >
      <Form {...form}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="admin@example.com"
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="John Doe"
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
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    {...field}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormDescription>
                  Leave empty if user already exists.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="roleType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isSubmitting}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {roleOptions.map((role) => (
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
        </div>
      </Form>
    </FormDialog>
  );
}

interface EditUserRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: PlatformUser | null;
  onSubmit: (data: UpdatePlatformUserInput) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function EditUserRoleDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
  isSubmitting = false,
}: EditUserRoleDialogProps) {
  const form = useForm<UpdatePlatformUserInput>({
    resolver: zodResolver(updatePlatformUserSchema),
    defaultValues: {
      roleType: user?.roleType ?? "SUPPORT_MANAGER",
    },
  });

  // Reset form when user changes
  if (user && form.getValues("roleType") !== user.roleType) {
    form.reset({ roleType: user.roleType });
  }

  const handleSubmit = async (data: UpdatePlatformUserInput) => {
    await onSubmit(data);
  };

  if (!user) return null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change Role"
      description={`Update the platform role for ${user.name || user.email}`}
      onSubmit={form.handleSubmit(handleSubmit)}
      isSubmitting={isSubmitting}
      submitLabel="Save"
    >
      <Form {...form}>
        <FormField
          control={form.control}
          name="roleType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={isSubmitting}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {roleOptions.map((role) => (
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
      </Form>
    </FormDialog>
  );
}

interface RevokeAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: PlatformUser | null;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function RevokeAccessDialog({
  open,
  onOpenChange,
  user,
  onConfirm,
  isSubmitting = false,
}: RevokeAccessDialogProps) {
  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      itemType="platform access"
      itemName={user?.name || user?.email}
      onConfirm={onConfirm}
      isLoading={isSubmitting}
      confirmLabel="Revoke Access"
      description="This will remove their platform administration privileges. They will still be able to access organizations they are members of."
    />
  );
}

export type {
  GrantAccessDialogProps,
  EditUserRoleDialogProps,
  RevokeAccessDialogProps,
};
