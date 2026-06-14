import type { ReactNode } from "react";

type DangerZoneProps = {
  title: string;
  description: string;
  action: ReactNode;
};

/** Separated area for irreversible or high-impact actions. */
export function DangerZone({ title, description, action }: DangerZoneProps) {
  return (
    <section className="space-y-3 border-t pt-6">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </section>
  );
}
