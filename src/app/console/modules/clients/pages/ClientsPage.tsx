import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";
import { ConsolePage } from "../../../components/layout/ConsolePage";
import { NavStatusBadge } from "../../../components/layout/NavStatusBadge";
import { CONSOLE_NAV_ITEMS } from "../../../config/navigation";

const clientsNav = CONSOLE_NAV_ITEMS.find((item) => item.id === "clients")!;

export function ClientsPage() {
  return (
    <ConsolePage
      title="OAuth clients"
      description={clientsNav.summary}
      actions={<NavStatusBadge status="stub" />}
    >
      <Card>
        <CardHeader>
          <CardTitle>Server stub in place</CardTitle>
          <CardDescription>Module {clientsNav.module} — OAuth 2.1 authorization server</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The browser authorization flow is available at{" "}
          <code className="text-foreground">/oauth/authorize</code>. Client CRUD, redirect URI editing,
          and secret rotation will replace this card when the client APIs ship.
        </CardContent>
      </Card>
    </ConsolePage>
  );
}
