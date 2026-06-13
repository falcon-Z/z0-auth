import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@z0/components/ui/card";

type SettingsCategoryCardProps = {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
};

export function SettingsCategoryCard({ title, description, to, icon: Icon }: SettingsCategoryCardProps) {
  return (
    <Link to={to} className="group block h-full">
      <Card className="h-full gap-0 py-5 shadow-xs transition-colors hover:border-foreground/20 hover:bg-muted/20">
        <CardContent className="flex h-full flex-col p-0 px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
            </div>
            <ArrowUpRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden
            />
          </div>
          <div className="mt-4 min-w-0">
            <p className="font-medium">{title}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
