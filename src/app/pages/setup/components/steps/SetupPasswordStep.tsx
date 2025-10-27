import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@z0/components/ui/form";
import { PasswordInput } from "@z0/components/ui/password-input";
import { UseFormReturn } from "react-hook-form";
import type { PasswordValidationResult } from "@z0/utils/password-validation";

interface SetupFormValues {
  organization: string;
  name: string;
  email: string;
  password: string;
}

interface SetupPasswordStepProps {
  form: UseFormReturn<SetupFormValues>;
  disabled: boolean;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onValidationChange: (validation: PasswordValidationResult) => void;
}

export function SetupPasswordStep({
  form,
  disabled,
  onKeyPress,
  onValidationChange,
}: SetupPasswordStepProps) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-5 duration-300">
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-base">Create Password</FormLabel>
            <FormControl>
              <PasswordInput
                value={field.value}
                onChange={field.onChange}
                onValidationChange={onValidationChange}
                placeholder="Create a strong password"
                autoComplete="new-password"
                autoFocus
                showStrengthIndicator={true}
                showToggleVisibility={true}
                disabled={disabled}
                onKeyPress={onKeyPress}
                className="h-12 text-lg"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
