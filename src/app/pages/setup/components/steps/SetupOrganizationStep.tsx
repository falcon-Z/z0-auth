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
    <div className="space-y-4 animate-in fade-in slide-in-from-right-5 duration-300">
      <FormField
        control={form.control}
        name="organization"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-base">Organization Name</FormLabel>
            <FormControl>
              <Input
                type="text"
                placeholder="e.g., Acme Corp"
                autoFocus
                disabled={disabled}
                className="h-12 text-lg"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-base">Your Name</FormLabel>
            <FormControl>
              <Input
                type="text"
                placeholder="e.g., Jane Doe"
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
