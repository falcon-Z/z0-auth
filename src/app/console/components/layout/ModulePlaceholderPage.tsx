import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import type { ConsoleNavItem } from "../../config/navigation";
import { ConsolePage } from "./ConsolePage";
import { NavStatusBadge } from "./NavStatusBadge";

type ModulePlaceholderPageProps = {
  item: ConsoleNavItem;
};

/** Shown only for nav items not yet implemented. No dev or planning copy. */
export function ModulePlaceholderPage({ item }: ModulePlaceholderPageProps) {
  return (
    <ConsolePage
      title={item.title}
      description={item.summary}
      actions={<NavStatusBadge status={item.status} />}
    >
      <Alert>
        <AlertTitle>Not available yet</AlertTitle>
        <AlertDescription>This area has not been built yet.</AlertDescription>
      </Alert>
    </ConsolePage>
  );
}
