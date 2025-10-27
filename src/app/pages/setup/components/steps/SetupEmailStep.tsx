import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@z0/components/ui/form";
import { Input } from "@z0/components/ui/input";
import { Mail } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";

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
              <Input
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                autoFocus
                disabled={disabled}
                onKeyPress={onKeyPress}
                className="h-12 text-base"
                {...field}
              />
            </FormControl>
            <FormDescription>
              Enter a valid email address that you have access to
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
