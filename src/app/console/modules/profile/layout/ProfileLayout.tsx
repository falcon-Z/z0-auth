import { Outlet } from "react-router-dom";

import { Badge } from "@z0/components/ui/badge";
import { EntityDetailLayout, type EntityDetailTab } from "../../../components/layout/EntityDetailLayout";
import { formatRoleKey } from "../../../lib/tenant-permissions";
import { useSession } from "../../../context/session-context";

const PROFILE_TABS: EntityDetailTab[] = [
  { id: "overview", label: "Overview", to: "/profile" },
  { id: "security", label: "Security", to: "/profile/security" },
  { id: "sessions", label: "Sessions", to: "/profile/sessions" },
  { id: "tenants", label: "Tenants", to: "/profile/tenants" },
];

export function ProfileLayout() {
  const { session } = useSession();
  const platformRoles = session.roles ?? [];

  return (
    <EntityDetailLayout
      backTo="/"
      backLabel="Dashboard"
      name={session.user.name}
      subtitle={session.user.email}
      basePath="/profile"
      tabs={PROFILE_TABS}
      badges={
        platformRoles.length > 0
          ? platformRoles.map((role) => (
              <Badge key={role} variant="secondary" className="capitalize">
                {formatRoleKey(role)}
              </Badge>
            ))
          : undefined
      }
    >
      <Outlet />
    </EntityDetailLayout>
  );
}
