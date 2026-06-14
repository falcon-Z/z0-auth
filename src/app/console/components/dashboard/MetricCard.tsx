import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@z0/components/ui/card";

type MetricCardProps = {
  label: string;
  to: string;
  value?: ReactNode;
};

export function MetricCard({ label, value, to }: MetricCardProps) {
  return (
    <Link to={to} className="group block">
      <Card className="gap-0 py-4 shadow-xs transition-colors hover:border-foreground/20 hover:bg-muted/20 sm:py-5">
        <CardContent className="p-0 px-3 sm:px-5">
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium sm:text-sm">{label}</p>
              {value !== undefined ? (
                <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>
              ) : null}
            </div>
            <ArrowUpRight
              className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground sm:size-4"
              aria-hidden
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
