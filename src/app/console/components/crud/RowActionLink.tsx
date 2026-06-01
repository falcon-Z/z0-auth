import { Link } from "react-router-dom";

import { Button } from "@z0/components/ui/button";

type RowActionLinkProps = {
  to: string;
  children: React.ReactNode;
  className?: string;
};

/** Consistent table row action styled as a ghost button link. */
export function RowActionLink({ to, children, className }: RowActionLinkProps) {
  return (
    <Button type="button" variant="ghost" size="sm" className={className} asChild>
      <Link to={to}>{children}</Link>
    </Button>
  );
}
