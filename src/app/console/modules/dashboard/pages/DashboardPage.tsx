import { Link } from "react-router-dom";

import { Button } from "@z0/components/ui/button";
import { ConsolePage } from "../../../components/layout/ConsolePage";
import { PageError } from "../../../components/feedback/PageError";
import { hasPlatformConsoleAccess } from "../../../lib/console-access";
import { sessionHasPermission } from "../../../lib/tenant-permissions";
import { useTenantPermissions } from "../../../hooks/use-tenant-permissions";
import { useSession } from "../../../context/session-context";
import { PlatformDashboardCards } from "../components/PlatformDashboardCards";
import { TenantDashboardCards } from "../components/TenantDashboardCards";

export function DashboardPage() {
  const { session } = useSession();
  const { canReadMembers } = useTenantPermissions();

  if (hasPlatformConsoleAccess(session)) {
    return (
      <ConsolePage title="Platform">
        <PlatformDashboardCards session={session} canReadMembers={canReadMembers} />
      </ConsolePage>
    );
  }

  const tenant = session.tenant;
  if (!tenant) {
    const canOpenTenants = sessionHasPermission(session, "tenants:read");

    return (
      <ConsolePage title="Dashboard">
        <PageError title="No tenant" message="You are not a member of any tenant yet.">
          {canOpenTenants ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/tenants">View tenants</Link>
            </Button>
          ) : null}
        </PageError>
      </ConsolePage>
    );
  }

  return (
    <ConsolePage title={tenant.name}>
      <TenantDashboardCards session={session} tenantId={tenant.id} canReadMembers={canReadMembers} />
    </ConsolePage>
  );
}
