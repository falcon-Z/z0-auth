import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";
import { useSession } from "../../../context/session-context";

export function DashboardPage() {
  const { session } = useSession();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Platform setup is complete. Use the header to manage your session and organization context.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your account</CardTitle>
            <CardDescription>Signed in across the platform and active organization.</CardDescription>
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
            <CardTitle>Active organization</CardTitle>
            <CardDescription>
              {session.canSwitchOrganization
                ? "Use the organization control in the header to switch context."
                : "You belong to one organization on this instance."}
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
                  <span className="text-muted-foreground">Organization roles </span>
                  {session.tenantRoles?.length ? session.tenantRoles.join(", ") : "—"}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">No organization selected.</p>
            )}
            {session.organizations && session.organizations.length > 1 ? (
              <p className="text-muted-foreground">
                Member of {session.organizations.length} organizations.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
