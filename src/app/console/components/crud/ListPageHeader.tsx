import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

import { Button } from "@z0/components/ui/button";

type ListPageHeaderProps = {
  title: string;
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
};

export function ListPageHeader({ title, backTo, backLabel = "Back", actions }: ListPageHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b pb-6">
      <div className="flex min-w-0 items-center gap-1">
        {backTo ? (
          <Button variant="ghost" size="icon" className="size-9 shrink-0" asChild>
            <Link to={backTo} aria-label={backLabel}>
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
        ) : null}
        <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div> : null}
    </header>
  );
}
