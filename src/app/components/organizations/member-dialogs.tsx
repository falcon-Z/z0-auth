/**
 * Member dialogs
 * Invite, edit role, and remove member dialogs
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormDialog, DeleteConfirmDialog } from "@z0/app/components/shared";
import { MemberInviteForm } from "./member-invite-form";
import {
  Form,
  FormControl,
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
import { updateMemberRoleSchema, type UpdateMemberRoleInput, type InviteMemberInput, type AddMemberInput } from "@z0/validation";
import { ORG_ROLE_LABELS, type OrgMember, type OrgRoleType } from "@z0/types";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: InviteMemberInput | AddMemberInput) => void | Promise<void>;
  isSubmitting?: boolean;
  /** Show name field for creating new users */
  showNameField?: boolean;
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
  showNameField = false,
}: InviteMemberDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={showNameField ? "Add Member" : "Invite Member"}
      description={
        showNameField
          ? "Create a new user and add them to this organization."
          : "Send an invitation to join this organization."
      }
      onSubmit={(e) => e.preventDefault()}
      isSubmitting={isSubmitting}
      hideFooter
    >
      <MemberInviteForm
        showNameField={showNameField}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        formId="invite-member-form"
      />
      <div className="flex justify-end gap-2 pt-4">
        <button
          type="button"
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
          onClick={() => onOpenChange(false)}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="invite-member-form"
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Sending..." : showNameField ? "Add Member" : "Send Invitation"}
        </button>
      </div>
    </FormDialog>
  );
}

interface EditMemberRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: OrgMember | null;
  onSubmit: (data: UpdateMemberRoleInput) => void | Promise<void>;
  isSubmitting?: boolean;
}

export function EditMemberRoleDialog({
  open,
  onOpenChange,
  member,
  onSubmit,
  isSubmitting = false,
}: EditMemberRoleDialogProps) {
  const form = useForm<UpdateMemberRoleInput>({
    resolver: zodResolver(updateMemberRoleSchema),
    defaultValues: {
      roleType: member?.roleType ?? "ORG_MEMBER",
    },
  });

  // Reset form when member changes
  if (member && form.getValues("roleType") !== member.roleType) {
    form.reset({ roleType: member.roleType });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = form.getValues();
    await onSubmit(data);
  };

  const roleOptions: { value: OrgRoleType; label: string }[] = [
    { value: "ORG_OWNER", label: ORG_ROLE_LABELS.ORG_OWNER },
    { value: "ORG_ADMIN", label: ORG_ROLE_LABELS.ORG_ADMIN },
    { value: "ORG_DEVELOPER", label: ORG_ROLE_LABELS.ORG_DEVELOPER },
    { value: "ORG_MEMBER", label: ORG_ROLE_LABELS.ORG_MEMBER },
  ];

  if (!member) return null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change Role"
      description={`Update the role for ${member.name || member.email}`}
      onSubmit={handleSubmit}
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

interface RemoveMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: OrgMember | null;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function RemoveMemberDialog({
  open,
  onOpenChange,
  member,
  onConfirm,
  isSubmitting = false,
}: RemoveMemberDialogProps) {
  const isInvited = member?.memberStatus === "invited";

  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      itemType={isInvited ? "invitation" : "member"}
      itemName={member?.name || member?.email}
      onConfirm={onConfirm}
      isLoading={isSubmitting}
    />
  );
}

export type {
  InviteMemberDialogProps,
  EditMemberRoleDialogProps,
  RemoveMemberDialogProps,
};
