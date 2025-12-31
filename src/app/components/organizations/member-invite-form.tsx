/**
 * MemberInviteForm component
 * Form for inviting/adding members to an organization
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Checkbox } from "@z0/components/ui/checkbox";
import { inviteMemberSchema, addMemberSchema, type InviteMemberInput, type AddMemberInput } from "@z0/validation";
import { ORG_ROLE_LABELS, type OrgRoleType } from "@z0/types";

interface MemberInviteFormProps {
  /** Whether to show name field (for adding new users) */
  showNameField?: boolean;
  /** Form submission handler */
  onSubmit: (data: InviteMemberInput | AddMemberInput) => void;
  /** Whether form is submitting */
  isSubmitting?: boolean;
  /** Form ID for external submit button */
  formId?: string;
  /** Default role to select */
  defaultRole?: OrgRoleType;
}

export function MemberInviteForm({
  showNameField = false,
  onSubmit,
  isSubmitting = false,
  formId = "member-invite-form",
  defaultRole = "ORG_MEMBER",
}: MemberInviteFormProps) {
  const form = useForm<AddMemberInput>({
    resolver: zodResolver(showNameField ? addMemberSchema : inviteMemberSchema),
    defaultValues: {
      email: "",
      name: "",
      roleType: defaultRole,
      sendInvite: true,
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    onSubmit(data);
  });

  const roleOptions: { value: OrgRoleType; label: string; description: string }[] = [
    {
      value: "ORG_OWNER",
      label: ORG_ROLE_LABELS.ORG_OWNER,
      description: "Full access to all organization resources",
    },
    {
      value: "ORG_ADMIN",
      label: ORG_ROLE_LABELS.ORG_ADMIN,
      description: "Can manage members and settings",
    },
    {
      value: "ORG_DEVELOPER",
      label: ORG_ROLE_LABELS.ORG_DEVELOPER,
      description: "Can create and manage applications",
    },
    {
      value: "ORG_MEMBER",
      label: ORG_ROLE_LABELS.ORG_MEMBER,
      description: "Basic access to organization resources",
    },
  ];

  return (
    <Form {...form}>
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  disabled={isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {showNameField && (
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="John Doe"
                    disabled={isSubmitting}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Required when creating a new user
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="roleType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
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

        <FormField
          control={form.control}
          name="sendInvite"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isSubmitting}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Send invitation email</FormLabel>
                <FormDescription>
                  Notify the user about their invitation
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

export type { MemberInviteFormProps };
