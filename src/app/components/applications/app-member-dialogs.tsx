/**
 * App member dialogs
 * Add, edit role, and remove member dialogs
 */

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
} from "@z0/components/ui/form";
import { Input } from "@z0/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
import { APP_ROLE_LABELS, type AppMember, type AppRoleType } from "@z0/types";

// Validation schema for adding app member
const addAppMemberSchema = z.object({
  email: z.string().email("Valid email is required"),
  roleType: z.enum(["APP_OWNER", "APP_MANAGER", "APP_USER"]),
});

type AddAppMemberInput = z.infer<typeof addAppMemberSchema>;

// Validation schema for updating role
const updateAppMemberRoleSchema = z.object({
  roleType: z.enum(["APP_OWNER", "APP_MANAGER", "APP_USER"]),
});

type UpdateAppMemberRoleInput = z.infer<typeof updateAppMemberRoleSchema>;

interface AddAppMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AddAppMemberInput) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function AddAppMemberDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
}: AddAppMemberDialogProps) {
  const form = useForm<AddAppMemberInput>({
    resolver: zodResolver(addAppMemberSchema),
    defaultValues: {
      email: "",
      roleType: "APP_USER",
    },
  });

  const handleSubmit = async (data: AddAppMemberInput) => {
    await onSubmit(data);
    form.reset();
  };

  const roleOptions: { value: AppRoleType; label: string }[] = [
    { value: "APP_OWNER", label: APP_ROLE_LABELS.APP_OWNER },
    { value: "APP_MANAGER", label: APP_ROLE_LABELS.APP_MANAGER },
    { value: "APP_USER", label: APP_ROLE_LABELS.APP_USER },
  ];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Member"
      description="Add an organization member to this application."
      onSubmit={form.handleSubmit(handleSubmit)}
      isSubmitting={isSubmitting}
      submitLabel="Add"
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
                    placeholder="user@example.com"
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
                        {role.label}
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

interface EditAppMemberRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: AppMember | null;
  onSubmit: (data: UpdateAppMemberRoleInput) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function EditAppMemberRoleDialog({
  open,
  onOpenChange,
  member,
  onSubmit,
  isSubmitting = false,
}: EditAppMemberRoleDialogProps) {
  const form = useForm<UpdateAppMemberRoleInput>({
    resolver: zodResolver(updateAppMemberRoleSchema),
    defaultValues: {
      roleType: member?.roleType ?? "APP_USER",
    },
  });

  // Reset form when member changes
  if (member && form.getValues("roleType") !== member.roleType) {
    form.reset({ roleType: member.roleType });
  }

  const handleSubmit = async (data: UpdateAppMemberRoleInput) => {
    await onSubmit(data);
  };

  const roleOptions: { value: AppRoleType; label: string }[] = [
    { value: "APP_OWNER", label: APP_ROLE_LABELS.APP_OWNER },
    { value: "APP_MANAGER", label: APP_ROLE_LABELS.APP_MANAGER },
    { value: "APP_USER", label: APP_ROLE_LABELS.APP_USER },
  ];

  if (!member) return null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change Role"
      description={`Update the role for ${member.name || member.email}`}
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
                      {role.label}
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

interface RemoveAppMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: AppMember | null;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function RemoveAppMemberDialog({
  open,
  onOpenChange,
  member,
  onConfirm,
  isSubmitting = false,
}: RemoveAppMemberDialogProps) {
  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      itemType="member"
      itemName={member?.name || member?.email}
      onConfirm={onConfirm}
      isLoading={isSubmitting}
    />
  );
}

export type {
  AddAppMemberDialogProps,
  EditAppMemberRoleDialogProps,
  RemoveAppMemberDialogProps,
  AddAppMemberInput,
  UpdateAppMemberRoleInput,
};
