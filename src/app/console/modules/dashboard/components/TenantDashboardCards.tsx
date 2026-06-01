import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";
import type { SessionResponse } from "@z0/contracts/auth";

type TenantDashboardCardsProps = {
  session: SessionResponse;
  tenantId: string;
  canReadMembers: boolean;
};

function resolveTenant(session: SessionResponse, tenantId: string) {
  return (
    session.organizations?.find((t) => t.id === tenantId) ??
    (session.tenant?.id === tenantId ? session.tenant : null)
  );
}

export function TenantDashboardCards({ session, tenantId, canReadMembers }: TenantDashboardCardsProps) {
  const tenant = resolveTenant(session, tenantId);
  const isActive = session.tenant?.id === tenantId;

  if (!tenant) {
    return (
      <p className="text-muted-foreground text-sm">Tenant details are not available for this account.</p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="md:col-span-2 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Tenant dashboard</CardTitle>
          <CardDescription>
            Overview for {tenant.name}. App-specific dashboards will appear here when OAuth clients ship.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">{tenant.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Slug </span>
            {tenant.slug}
          </p>
          {isActive ? (
            <p>
              <span className="text-muted-foreground">Your roles </span>
              {session.tenantRoles?.length ? session.tenantRoles.join(", ") : "—"}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Switch to this tenant in the sidebar to manage members and invites.
            </p>
          )}
        </CardContent>
      </Card>

      {canReadMembers && isActive ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Members</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/members">
                Open
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">People and pending invitations for this tenant.</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Your account</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to="/profile">
              Open
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Password and sessions for you as a signed-in user.</p>
        </CardContent>
      </Card>
    </div>
  );
}
