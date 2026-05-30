import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";
import { ConsolePage } from "../../../components/layout/ConsolePage";
import { useSession } from "../../../context/session-context";

export function DashboardPage() {
  const { session } = useSession();

  return (
    <ConsolePage
      title="Dashboard"
      description="Platform setup is complete. Use the sidebar to open tenant and application settings as they ship."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your account</CardTitle>
            <CardDescription>Signed in across the platform and active tenant.</CardDescription>
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
              <span className="text-muted-foreground">Platform roles </span>
              {session.roles?.length ? session.roles.join(", ") : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active tenant</CardTitle>
            <CardDescription>
              {session.canSwitchOrganization
                ? "Use the workspace menu at the top of the sidebar to switch tenants."
                : "You belong to one tenant on this instance."}
            </CardDescription>
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
                  <span className="text-muted-foreground">Tenant roles </span>
                  {session.tenantRoles?.length ? session.tenantRoles.join(", ") : "—"}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">No tenant selected.</p>
            )}
            {session.organizations && session.organizations.length > 1 ? (
              <p className="text-muted-foreground">Member of {session.organizations.length} tenants.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ConsolePage>
  );
}
