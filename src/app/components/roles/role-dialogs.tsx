/**
 * Role dialogs
 * Create, edit, and delete role dialogs
 */

import { useEffect } from "react";
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
import { Textarea } from "@z0/components/ui/textarea";
import { Checkbox } from "@z0/components/ui/checkbox";
import type { Role } from "./role-columns";

// Validation schema for roles
const roleSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string()),
});

type RoleInput = z.infer<typeof roleSchema>;

// Available permissions - can be customized per implementation
const availablePermissions = [
  { value: "users:read", label: "Read Users", category: "Users" },
  { value: "users:write", label: "Write Users", category: "Users" },
  { value: "users:delete", label: "Delete Users", category: "Users" },
  { value: "apps:read", label: "Read Applications", category: "Applications" },
  { value: "apps:write", label: "Write Applications", category: "Applications" },
  { value: "apps:delete", label: "Delete Applications", category: "Applications" },
  { value: "roles:read", label: "Read Roles", category: "Roles" },
  { value: "roles:write", label: "Write Roles", category: "Roles" },
  { value: "roles:delete", label: "Delete Roles", category: "Roles" },
  { value: "settings:read", label: "Read Settings", category: "Settings" },
  { value: "settings:write", label: "Write Settings", category: "Settings" },
];

// Group permissions by category
const permissionsByCategory = availablePermissions.reduce(
  (acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  },
  {} as Record<string, typeof availablePermissions>
);

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: RoleInput) => void | Promise<void>;
  isSubmitting?: boolean;
  customPermissions?: { value: string; label: string; category?: string }[];
}

export function CreateRoleDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
  customPermissions,
}: CreateRoleDialogProps) {
  const form = useForm<RoleInput>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: "",
      description: "",
      permissions: [],
    },
  });

  const handleSubmit = async (data: RoleInput) => {
    await onSubmit(data);
    form.reset();
  };

  const permissions = customPermissions || availablePermissions;
  const groupedPermissions = customPermissions
    ? permissions.reduce(
        (acc, perm) => {
          const category = perm.category || "General";
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(perm);
          return acc;
        },
        {} as Record<string, typeof permissions>
      )
    : permissionsByCategory;

  return (
    <FormDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) form.reset();
        onOpenChange(isOpen);
      }}
      title="Create Role"
      description="Create a new role with specific permissions."
      onSubmit={form.handleSubmit(handleSubmit)}
      isSubmitting={isSubmitting}
      submitLabel="Create Role"
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
                    placeholder="Editor"
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
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe what this role can do..."
                    className="resize-none"
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
            name="permissions"
            render={() => (
              <FormItem>
                <FormLabel>Permissions</FormLabel>
                <FormDescription>
                  Select the permissions for this role.
                </FormDescription>
                <div className="space-y-4 mt-2 max-h-64 overflow-y-auto">
                  {Object.entries(groupedPermissions).map(([category, perms]) => (
                    <div key={category} className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        {category}
                      </h4>
                      <div className="space-y-2 pl-2">
                        {perms.map((perm) => (
                          <FormField
                            key={perm.value}
                            control={form.control}
                            name="permissions"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(perm.value)}
                                    onCheckedChange={(checked) => {
                                      const current = field.value || [];
                                      if (checked) {
                                        field.onChange([...current, perm.value]);
                                      } else {
                                        field.onChange(
                                          current.filter((v) => v !== perm.value)
                                        );
                                      }
                                    }}
                                    disabled={isSubmitting}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">
                                  {perm.label}
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

interface EditRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onSubmit: (data: RoleInput) => void | Promise<void>;
  isSubmitting?: boolean;
  customPermissions?: { value: string; label: string; category?: string }[];
}

export function EditRoleDialog({
  open,
  onOpenChange,
  role,
  onSubmit,
  isSubmitting = false,
  customPermissions,
}: EditRoleDialogProps) {
  const form = useForm<RoleInput>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: "",
      description: "",
      permissions: [],
    },
  });

  // Reset form when role changes
  useEffect(() => {
    if (role) {
      form.reset({
        name: role.name,
        description: role.description || "",
        permissions: role.permissions || [],
      });
    }
  }, [role, form]);

  const handleSubmit = async (data: RoleInput) => {
    await onSubmit(data);
  };

  const permissions = customPermissions || availablePermissions;
  const groupedPermissions = customPermissions
    ? permissions.reduce(
        (acc, perm) => {
          const category = perm.category || "General";
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(perm);
          return acc;
        },
        {} as Record<string, typeof permissions>
      )
    : permissionsByCategory;

  if (!role) return null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Role"
      description={`Update the "${role.name}" role.`}
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
                    placeholder="Editor"
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
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe what this role can do..."
                    className="resize-none"
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
            name="permissions"
            render={() => (
              <FormItem>
                <FormLabel>Permissions</FormLabel>
                <div className="space-y-4 mt-2 max-h-64 overflow-y-auto">
                  {Object.entries(groupedPermissions).map(([category, perms]) => (
                    <div key={category} className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        {category}
                      </h4>
                      <div className="space-y-2 pl-2">
                        {perms.map((perm) => (
                          <FormField
                            key={perm.value}
                            control={form.control}
                            name="permissions"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(perm.value)}
                                    onCheckedChange={(checked) => {
                                      const current = field.value || [];
                                      if (checked) {
                                        field.onChange([...current, perm.value]);
                                      } else {
                                        field.onChange(
                                          current.filter((v) => v !== perm.value)
                                        );
                                      }
                                    }}
                                    disabled={isSubmitting}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer">
                                  {perm.label}
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

interface DeleteRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function DeleteRoleDialog({
  open,
  onOpenChange,
  role,
  onConfirm,
  isSubmitting = false,
}: DeleteRoleDialogProps) {
  const memberCount = role?.memberCount || 0;
  const description =
    memberCount > 0
      ? `This role is assigned to ${memberCount} member${memberCount !== 1 ? "s" : ""}. They will lose all permissions associated with this role.`
      : undefined;

  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      itemType="role"
      itemName={role?.name}
      onConfirm={onConfirm}
      isLoading={isSubmitting}
      description={description}
    />
  );
}

export type {
  CreateRoleDialogProps,
  EditRoleDialogProps,
  DeleteRoleDialogProps,
  RoleInput,
};
