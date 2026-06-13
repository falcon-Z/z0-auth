import type { ReactNode } from "react";

import { Button } from "@z0/components/ui/button";
import { Card, CardContent } from "@z0/components/ui/card";

type EmptyStateProps = {
  message: string;
  action?: ReactNode;
};

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <Card className="border-dashed py-12 shadow-none">
      <CardContent className="flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
        {action}
      </CardContent>
    </Card>
  );
}

export function EmptyStateButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button type="button" onClick={onClick}>
      {children}
    </Button>
  );
}
