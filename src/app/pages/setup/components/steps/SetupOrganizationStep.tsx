import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@z0/components/ui/form";
import { Input } from "@z0/components/ui/input";
import { Building2, User } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";

interface SetupFormValues {
  organization: string;
  name: string;
  email: string;
  password: string;
}

interface SetupOrganizationStepProps {
  form: UseFormReturn<SetupFormValues>;
  disabled: boolean;
  onKeyPress: (e: React.KeyboardEvent) => void;
}

export function SetupOrganizationStep({
  form,
  disabled,
  onKeyPress,
}: SetupOrganizationStepProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-5 duration-300">
      <div className="rounded-lg bg-muted/50 p-4 border">
        <p className="text-sm text-muted-foreground">
          Tell us a bit about your organization and yourself. This helps us
          personalize your experience.
        </p>
      </div>

      <FormField
        control={form.control}
        name="organization"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Organization Name
            </FormLabel>
            <FormControl>
              <Input
                type="text"
                placeholder="e.g., Acme Corp"
                autoFocus
                disabled={disabled}
                className="h-12 text-base"
                {...field}
              />
            </FormControl>
            <FormDescription>
              The name of your company or organization
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-base flex items-center gap-2">
              <User className="w-4 h-4" />
              Your Full Name
            </FormLabel>
            <FormControl>
              <Input
                type="text"
                placeholder="e.g., Jane Doe"
                disabled={disabled}
                onKeyPress={onKeyPress}
                className="h-12 text-base"
                {...field}
              />
            </FormControl>
            <FormDescription>Your name as the administrator</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
