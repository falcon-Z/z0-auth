import type { ComponentProps } from "react";

import { Button } from "@z0/components/ui/button";
import { cn } from "../../lib/utils";

/** Low-emphasis destructive control — not a primary or secondary action. */
export function DestructiveButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20",
        className,
      )}
      {...props}
    />
  );
}
