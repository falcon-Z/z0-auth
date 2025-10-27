import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@z0/components/ui/form";
import { Input } from "@z0/components/ui/input";
import { Mail, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { useEmailValidation } from "../../hooks/useSetupValidation";

interface SetupFormValues {
  organization: string;
  name: string;
  email: string;
  password: string;
}

interface SetupEmailStepProps {
  form: UseFormReturn<SetupFormValues>;
  disabled: boolean;
  onKeyPress: (e: React.KeyboardEvent) => void;
}

export function SetupEmailStep({
  form,
  disabled,
  onKeyPress,
}: SetupEmailStepProps) {
  const email = form.watch("email");
  const emailValidation = useEmailValidation(email, !disabled);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-5 duration-300">
      <div className="rounded-lg bg-muted/50 p-4 border">
        <p className="text-sm text-muted-foreground">
          This email will be used as your administrator account. You'll use it
          to sign in and manage your authentication system.
        </p>
      </div>

      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Admin Email Address
            </FormLabel>
            <FormControl>
              <div className="relative">
                <Input
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoFocus
                  disabled={disabled}
                  onKeyPress={onKeyPress}
                  className="h-12 text-base pr-10"
                  {...field}
                />
                {emailValidation.isValidating && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!emailValidation.isValidating &&
                  emailValidation.isValid === true && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                {!emailValidation.isValidating &&
                  emailValidation.isValid === false && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                    </div>
                  )}
              </div>
            </FormControl>
            <FormDescription>
              {emailValidation.isValidating && (
                <span className="text-muted-foreground">
                  Checking availability...
                </span>
              )}
              {!emailValidation.isValidating &&
                emailValidation.isValid === true && (
                  <span className="text-green-600 dark:text-green-400">
                    {emailValidation.message}
                  </span>
                )}
              {!emailValidation.isValidating &&
                emailValidation.isValid === false && (
                  <span className="text-destructive">
                    {emailValidation.error || emailValidation.message}
                  </span>
                )}
              {!emailValidation.isValidating &&
                emailValidation.isValid === null && (
                  <span>
                    Enter a valid email address that you have access to
                  </span>
                )}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
