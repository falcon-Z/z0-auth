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
import React, { useState, useCallback } from "react";
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
  const passwordValue = form.watch("password") || "";

  // Calculate validation on every render to stay in sync
  const validation = validatePassword(passwordValue);

  // Update parent component when validation changes
  React.useEffect(() => {
    onValidationChange(validation);
  }, [passwordValue, onValidationChange]);

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      form.setValue("password", newValue);
    },
    [form]
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

      {/* Password Strength Indicator - Always visible to prevent layout shift */}
      <div
        className="rounded-lg border bg-card p-4 shadow-sm transition-opacity duration-200"
        style={{ minHeight: "280px" }}
      >
        {passwordValue ? (
          <PasswordStrengthIndicator
            validation={validation}
            showDetails={true}
          />
        ) : (
          <div className="space-y-3 opacity-60">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">
                  Password Strength
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                  Not set
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-muted"
                  style={{ width: "0%" }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Requirements:
              </h4>
              <div className="grid grid-cols-1 gap-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  <span>At least 8 characters long</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  <span>Contains uppercase letter (A-Z)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  <span>Contains lowercase letter (a-z)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  <span>Contains number (0-9)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  <span>Contains special character (!@#$%...)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  <span>Avoids common patterns</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
