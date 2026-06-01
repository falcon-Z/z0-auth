import type { SessionResponse } from "@z0/contracts/auth";
import { DashboardLinkCard } from "../../../components/dashboard/DashboardLinkCard";

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
    return <p className="text-sm text-muted-foreground">Tenant not found.</p>;
  }

  const links: { title: string; to: string }[] = [];
  if (canReadMembers && isActive) {
    links.push({ title: "Members", to: "/members" });
  }
  links.push({ title: "Your account", to: "/profile" });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <DashboardLinkCard key={link.to} title={link.title} to={link.to} />
      ))}
    </div>
  );
}
