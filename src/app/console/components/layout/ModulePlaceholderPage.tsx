import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";
import type { ConsoleNavItem } from "../../config/navigation";
import { ConsolePage } from "./ConsolePage";
import { NavStatusBadge } from "./NavStatusBadge";

type ModulePlaceholderPageProps = {
  item: ConsoleNavItem;
};

export function ModulePlaceholderPage({ item }: ModulePlaceholderPageProps) {
  return (
    <ConsolePage
      title={item.title}
      description={item.summary}
      actions={<NavStatusBadge status={item.status} />}
    >
      <Alert>
        <Info className="size-4" />
        <AlertTitle>Module {item.module}</AlertTitle>
        <AlertDescription>
          This screen is registered in the console shell. Replace this placeholder when the API contract
          and validation matrix rows for {item.title} are ready.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Integration checklist</CardTitle>
          <CardDescription>Follow the same steps for every console module.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. OpenAPI + validation matrix</p>
          <p>2. Handlers and integration tests</p>
          <p>3. Page under <code className="text-foreground">src/app/console/modules/</code></p>
          <p>4. Register in <code className="text-foreground">routes.tsx</code> and set nav status to Live</p>
        </CardContent>
      </Card>
    </ConsolePage>
  );
}
