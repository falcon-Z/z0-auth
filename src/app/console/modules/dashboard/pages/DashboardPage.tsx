import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { ConsolePage } from "../../../components/layout/ConsolePage";
import { hasPlatformConsoleAccess } from "../../../lib/console-access";
import { useTenantPermissions } from "../../../hooks/use-tenant-permissions";
import { useSession } from "../../../context/session-context";
import { PlatformDashboardCards } from "../components/PlatformDashboardCards";
import { TenantDashboardCards } from "../components/TenantDashboardCards";

export function DashboardPage() {
  const { session } = useSession();
  const { canReadMembers } = useTenantPermissions();

  if (hasPlatformConsoleAccess(session)) {
    return (
      <ConsolePage
        title="Platform"
        description="Instance-wide dashboard. Open a tenant for membership and tenant-scoped work."
      >
        <PlatformDashboardCards session={session} canReadMembers={canReadMembers} />
      </ConsolePage>
    );
  }

  const tenant = session.tenant;
  if (!tenant) {
    return (
      <ConsolePage title="Dashboard">
        <Alert>
          <AlertTitle>No tenant</AlertTitle>
          <AlertDescription>
            You are not a member of any tenant yet. Ask an administrator for an invitation.
          </AlertDescription>
        </Alert>
      </ConsolePage>
    );
  }

  return (
    <ConsolePage title={tenant.name} description="Your tenant dashboard.">
      <TenantDashboardCards session={session} tenantId={tenant.id} canReadMembers={canReadMembers} />
    </ConsolePage>
  );
}
