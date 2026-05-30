import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

import { Button } from "@z0/components/ui/button";

type DetailPageHeaderProps = {
  backTo: string;
  backLabel?: string;
  title: string;
  actions?: ReactNode;
};

export function DetailPageHeader({ backTo, backLabel = "Back", title, actions }: DetailPageHeaderProps) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
        <Link to={backTo}>
          <ChevronLeft className="size-4" />
          {backLabel}
        </Link>
      </Button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
