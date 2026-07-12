import type { ReactNode } from "react";

import { Label } from "@z0/components/ui/label";

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
};

export function FormField({ label, htmlFor, error, hint, children }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
