import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@z0/components/ui/form";
import { Input } from "@z0/components/ui/input";
import { UseFormReturn } from "react-hook-form";

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
    <div className="space-y-4 animate-in fade-in slide-in-from-right-5 duration-300">
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-base">Admin Email Address</FormLabel>
            <FormControl>
              <Input
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                autoFocus
                disabled={disabled}
                onKeyPress={onKeyPress}
                className="h-12 text-lg"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
