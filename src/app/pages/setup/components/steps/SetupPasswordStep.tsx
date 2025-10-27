import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@z0/components/ui/form";
import { Input } from "@z0/components/ui/input";
import { Button } from "@z0/components/ui/button";
import { Eye, EyeOff, Shield } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { useState, useCallback } from "react";
import { cn } from "@z0/lib/utils";
import { PasswordStrengthIndicator } from "@z0/components/ui/password-strength-indicator";
import {
  validatePassword,
  type PasswordValidationResult,
} from "@z0/utils/password-validation";

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
  const [showPassword, setShowPassword] = useState(false);
  const [validation, setValidation] = useState<PasswordValidationResult>(
    validatePassword("")
  );
  const passwordValue = form.watch("password");

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      form.setValue("password", newValue);

      const newValidation = validatePassword(newValue);
      setValidation(newValidation);
      onValidationChange(newValidation);
    },
    [form, onValidationChange]
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-5 duration-300">
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Create Password
            </FormLabel>
            <FormControl>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter a strong password"
                  autoComplete="new-password"
                  autoFocus
                  disabled={disabled}
                  onKeyPress={onKeyPress}
                  className={cn(
                    "h-12 text-base pr-10 transition-colors",
                    passwordValue &&
                      !validation.isValid &&
                      "border-red-300 focus-visible:ring-red-500",
                    passwordValue &&
                      validation.isValid &&
                      "border-green-300 focus-visible:ring-green-500"
                  )}
                  {...field}
                  onChange={handlePasswordChange}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  disabled={disabled}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="sr-only">
                    {showPassword ? "Hide password" : "Show password"}
                  </span>
                </Button>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Password Strength Indicator in a separate card */}
      {passwordValue && (
        <div className="rounded-lg border bg-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          <PasswordStrengthIndicator
            validation={validation}
            showDetails={true}
          />
        </div>
      )}
    </div>
  );
}
