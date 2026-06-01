import type { SessionResponse } from "@z0/contracts/auth";
import { DashboardLinkCard } from "../../../components/dashboard/DashboardLinkCard";
import { sessionHasPermission } from "../../../lib/tenant-permissions";

type PlatformDashboardCardsProps = {
  session: SessionResponse;
  canReadMembers: boolean;
};

export function PlatformDashboardCards({ session, canReadMembers }: PlatformDashboardCardsProps) {
  const activeTenant = session.tenant;
  const links: { title: string; to: string }[] = [];

  if (sessionHasPermission(session, "platform:users:read")) {
    links.push({ title: "Users", to: "/users" });
  }
  if (sessionHasPermission(session, "tenants:read")) {
    links.push({ title: "Tenants", to: "/tenants" });
  }
  if (activeTenant && canReadMembers) {
    links.push({ title: "Members", to: "/members" });
  }
  links.push({ title: "Your account", to: "/profile" });

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((link) => (
        <DashboardLinkCard key={link.to} title={link.title} to={link.to} />
      ))}
    </div>
  );
}
