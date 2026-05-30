import { Badge } from "@z0/components/ui/badge";
import type { ConsoleNavStatus } from "../../config/navigation";

const LABELS: Record<ConsoleNavStatus, string> = {
  available: "Live",
  stub: "Stub",
  planned: "Planned",
};

const VARIANTS: Record<ConsoleNavStatus, "default" | "secondary" | "outline"> = {
  available: "secondary",
  stub: "outline",
  planned: "outline",
};

type NavStatusBadgeProps = {
  status: ConsoleNavStatus;
  className?: string;
};

export function NavStatusBadge({ status, className }: NavStatusBadgeProps) {
  if (status === "available") return null;

  return (
    <Badge variant={VARIANTS[status]} className={className}>
      {LABELS[status]}
    </Badge>
  );
}
