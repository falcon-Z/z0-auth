import type { ConsoleNavItem } from "../../config/navigation";
import { ConsolePage } from "./ConsolePage";

type ModulePlaceholderPageProps = {
  item: ConsoleNavItem;
};

/** Shown only for nav items not yet implemented. No dev or planning copy. */
export function ModulePlaceholderPage({ item }: ModulePlaceholderPageProps) {
  return (
    <ConsolePage title={item.title} description={item.summary}>
      <p className="text-sm text-muted-foreground">This area is not available yet.</p>
    </ConsolePage>
  );
}
