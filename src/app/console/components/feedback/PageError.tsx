import type { ReactNode } from "react";

import { Button } from "@z0/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";

type PageErrorProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  children?: ReactNode;
};

export function PageError({ title = "Something went wrong", message, onRetry, children }: PageErrorProps) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{message}</p>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
        {children}
      </AlertDescription>
    </Alert>
  );
}
