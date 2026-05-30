import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@z0/components/ui/card";
import { ConsolePage } from "../../../components/layout/ConsolePage";
import { useTenantPermissions } from "../../../hooks/use-tenant-permissions";
import { useSession } from "../../../context/session-context";

export function DashboardPage() {
  const { session } = useSession();
  const { canReadMembers } = useTenantPermissions();

  return (
    <ConsolePage title="Dashboard">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Name </span>
              {session.user.name}
            </p>
            <p>
              <span className="text-muted-foreground">Email </span>
              {session.user.email}
            </p>
            <p>
              <span className="text-muted-foreground">Platform </span>
              {session.roles?.length ? session.roles.join(", ") : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tenant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {session.tenant ? (
              <>
                <p>
                  <span className="text-muted-foreground">Name </span>
                  {session.tenant.name}
                </p>
                <p>
                  <span className="text-muted-foreground">Slug </span>
                  {session.tenant.slug}
                </p>
                <p>
                  <span className="text-muted-foreground">Roles </span>
                  {session.tenantRoles?.length ? session.tenantRoles.join(", ") : "—"}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">None selected</p>
            )}
          </CardContent>
        </Card>

        {canReadMembers && session.tenant ? (
          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Members</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link to="/members">
                  Open
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </ConsolePage>
  );
}
