import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

import { Button } from "@z0/components/ui/button";

type DetailPageHeaderProps = {
  backTo?: string;
  backLabel?: string;
  title: string;
  actions?: ReactNode;
};

export function DetailPageHeader({ backTo, backLabel = "Back", title, actions }: DetailPageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-1">
        {backTo ? (
          <Button variant="ghost" size="icon" className="size-9 shrink-0" asChild>
            <Link to={backTo} aria-label={backLabel}>
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
        ) : null}
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div> : null}
    </div>
  );
}
