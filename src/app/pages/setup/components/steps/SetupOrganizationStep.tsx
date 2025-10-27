import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@z0/components/ui/form";
import { Input } from "@z0/components/ui/input";
import {
  Building2,
  User,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { useOrganizationValidation } from "../../hooks/useSetupValidation";

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
  const organization = form.watch("organization");
  const orgValidation = useOrganizationValidation(organization, !disabled);

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
              <div className="relative">
                <Input
                  type="text"
                  placeholder="e.g., Acme Corp"
                  autoFocus
                  disabled={disabled}
                  className="h-12 text-base pr-10"
                  {...field}
                />
                {orgValidation.isValidating && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!orgValidation.isValidating &&
                  orgValidation.isValid === true && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                {!orgValidation.isValidating &&
                  orgValidation.isValid === false && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                    </div>
                  )}
              </div>
            </FormControl>
            <FormDescription>
              {orgValidation.isValidating && (
                <span className="text-muted-foreground">
                  Checking availability...
                </span>
              )}
              {!orgValidation.isValidating &&
                orgValidation.isValid === true && (
                  <span className="text-green-600 dark:text-green-400">
                    {orgValidation.message}
                  </span>
                )}
              {!orgValidation.isValidating &&
                orgValidation.isValid === false && (
                  <span className="text-destructive">
                    {orgValidation.error || orgValidation.message}
                  </span>
                )}
              {!orgValidation.isValidating &&
                orgValidation.isValid === null && (
                  <span>The name of your company or organization</span>
                )}
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
