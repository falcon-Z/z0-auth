import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  to?: string;
};

export function MetricCard({ label, value, to }: MetricCardProps) {
  const body = (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-xs">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block transition-colors hover:bg-muted/30 rounded-lg">
        {body}
      </Link>
    );
  }

  return body;
}
