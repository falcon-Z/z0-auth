import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";
import type { SessionResponse } from "@z0/contracts/auth";
import { sessionHasPermission } from "../../../lib/tenant-permissions";

type QuickLink = {
  title: string;
  description: string;
  to: string;
};

type PlatformDashboardCardsProps = {
  session: SessionResponse;
  canReadMembers: boolean;
};

export function PlatformDashboardCards({ session, canReadMembers }: PlatformDashboardCardsProps) {
  const activeTenant = session.tenant;

  const quickLinks: QuickLink[] = [
    {
      title: "Users",
      description: "Platform-wide accounts — disable, enable, and review roles.",
      to: "/users",
    },
    {
      title: "Tenants",
      description: "Tenants you belong to. Open one to manage members and settings.",
      to: "/tenants",
    },
    {
      title: "Your account",
      description: "Password and active sessions for your user.",
      to: "/profile",
    },
  ].filter((link) => {
    if (link.to === "/users") return sessionHasPermission(session, "platform:users:read");
    if (link.to === "/tenants") return sessionHasPermission(session, "tenants:read");
    return true;
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="md:col-span-2 border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Platform dashboard</CardTitle>
          <CardDescription>
            Instance-wide view. Pick a tenant from the workspace menu or Tenants list for membership and
            invites.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Platform</p>
            <p className="mt-1">You are here — operators and cross-tenant tools.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Tenant</p>
            <p className="mt-1">Per-tenant members, roles, and apps.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">App</p>
            <p className="mt-1 text-xs">Planned — per OAuth client after P3.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signed in as</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Name </span>
            {session.user?.name}
          </p>
          <p>
            <span className="text-muted-foreground">Email </span>
            {session.user?.email}
          </p>
          <p>
            <span className="text-muted-foreground">Platform roles </span>
            {session.roles?.length ? session.roles.join(", ") : "—"}
          </p>
        </CardContent>
      </Card>

      {activeTenant ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active tenant</CardTitle>
            <CardDescription>
              Tenant-scoped pages use this context. Switch workspace in the sidebar when you need another
              tenant.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/tenants/${activeTenant.id}`}>
                Tenant dashboard
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            {canReadMembers ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/members">
                  Members
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No active tenant</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Join or create a tenant to use membership and invite tools.
          </CardContent>
        </Card>
      )}

      {quickLinks.map((link) => (
        <Card key={link.to}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">{link.title}</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to={link.to}>
                Open
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{link.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
