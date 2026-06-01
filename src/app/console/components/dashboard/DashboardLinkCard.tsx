import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

type DashboardLinkCardProps = {
  title: string;
  to: string;
};

export function DashboardLinkCard({ title, to }: DashboardLinkCardProps) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-lg border bg-card px-5 py-4 text-sm font-medium shadow-xs transition-colors hover:bg-muted/40"
    >
      <span>{title}</span>
      <ArrowRight
        className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
