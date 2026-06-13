import { Outlet } from "react-router-dom";

import { Badge } from "@z0/components/ui/badge";
import { EntityDetailLayout, type EntityDetailTab } from "../../../components/layout/EntityDetailLayout";
import { useSession } from "../../../context/session-context";

const PROFILE_TABS: EntityDetailTab[] = [
  { id: "overview", label: "Overview", to: "/profile" },
  { id: "security", label: "Security", to: "/profile/security" },
  { id: "sessions", label: "Sessions", to: "/profile/sessions" },
];

export function ProfileLayout() {
  const { session } = useSession();

  return (
    <EntityDetailLayout
      name={session.user!.name}
      subtitle={session.user!.email}
      basePath="/profile"
      tabs={PROFILE_TABS}
      badges={
        session.isInstanceMember ? (
          <Badge variant="secondary">Team member</Badge>
        ) : undefined
      }
    >
      <Outlet />
    </EntityDetailLayout>
  );
}
