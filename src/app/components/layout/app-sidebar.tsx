import { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router";
import {
  LayoutDashboard,
  Building2,
  Users,
  Key,
  Shield,
  Settings,
  AppWindow,
  Layers,
  Mail,
  Webhook,
  ExternalLink,
  Activity,
  FileText,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "@z0/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@z0/components/ui/collapsible";
import { Badge } from "@z0/components/ui/badge";
import { useAuth } from "../../contexts/auth-context";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

export function AppSidebar() {
  const location = useLocation();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, isLoading, isPlatformAdmin } = useAuth();

  const { currentOrg, orgRole } = useMemo(() => {
    const orgs = user?.organizations || [];
    const currentOrganization = orgSlug
      ? orgs.find((o) => o.slug === orgSlug)
      : null;

    return {
      currentOrg: currentOrganization,
      orgRole: currentOrganization?.roleType || null,
    };
  }, [user, orgSlug]);

  // Role-based visibility
  const isOwner = orgRole === "ORG_OWNER";
  const isAdmin = orgRole === "ORG_ADMIN" || isOwner;
  const isDeveloper = orgRole === "ORG_DEVELOPER" || isAdmin;

  // Build org-scoped base path
  const orgBasePath = orgSlug ? `/org/${orgSlug}` : "";

  // Navigation groups
  const navGroups: NavGroup[] = useMemo(() => {
    const groups: NavGroup[] = [];

    // Main section (always visible when in org context)
    if (orgSlug) {
      groups.push({
        title: "Main",
        defaultOpen: true,
        items: [
          {
            title: "Dashboard",
            href: `${orgBasePath}/dashboard`,
            icon: LayoutDashboard,
          },
        ],
      });

      // Organization section (visible to all org members)
      groups.push({
        title: "Organization",
        defaultOpen: true,
        items: [
          {
            title: "Members",
            href: `${orgBasePath}/members`,
            icon: Users,
          },
          {
            title: "Invitations",
            href: `${orgBasePath}/invitations`,
            icon: Mail,
          },
          {
            title: "Applications",
            href: `${orgBasePath}/apps`,
            icon: AppWindow,
          },
          {
            title: "Settings",
            href: `${orgBasePath}/settings`,
            icon: Settings,
          },
        ],
      });

      // Access Control section (visible to admins)
      if (isAdmin) {
        groups.push({
          title: "Access Control",
          defaultOpen: false,
          items: [
            {
              title: "Roles",
              href: `${orgBasePath}/roles`,
              icon: Shield,
            },
            {
              title: "Scopes",
              href: `${orgBasePath}/scopes`,
              icon: Layers,
            },
          ],
        });
      }

      // Developers section (visible to developers and above)
      if (isDeveloper) {
        groups.push({
          title: "Developers",
          defaultOpen: false,
          items: [
            {
              title: "API Keys",
              href: `${orgBasePath}/api-keys`,
              icon: Key,
            },
            {
              title: "Webhooks",
              href: `${orgBasePath}/webhooks`,
              icon: Webhook,
            },
            {
              title: "OAuth Providers",
              href: `${orgBasePath}/providers`,
              icon: ExternalLink,
            },
          ],
        });
      }
    }

    // Platform Admin section (visible to platform admins)
    if (isPlatformAdmin) {
      groups.push({
        title: "Admin",
        defaultOpen: !orgSlug, // Open by default if no org context
        items: [
          {
            title: "Organizations",
            href: "/admin/organizations",
            icon: Building2,
          },
          {
            title: "Platform Users",
            href: "/admin/users",
            icon: Users,
          },
          {
            title: "Request Traces",
            href: "/admin/request-traces",
            icon: Activity,
          },
          {
            title: "SMTP Settings",
            href: "/admin/smtp",
            icon: Mail,
          },
          {
            title: "Audit Logs",
            href: "/admin/audit-logs",
            icon: FileText,
          },
        ],
      });
    }

    return groups;
  }, [orgSlug, orgBasePath, isAdmin, isDeveloper, isPlatformAdmin]);

  const isActive = (href: string) => {
    // Exact match for dashboard
    if (href.endsWith("/dashboard")) {
      return location.pathname === href;
    }
    return location.pathname.startsWith(href);
  };

  // Show loading skeleton while auth is initializing
  if (isLoading) {
    return (
      <aside className="w-64 border-r bg-card h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto">
        <div className="flex h-full flex-col p-4">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 border-r bg-card h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto">
      <div className="flex h-full flex-col p-4">
        {/* Navigation Groups */}
        <nav className="flex-1 space-y-4">
          {navGroups.map((group) => (
            <NavGroupComponent
              key={group.title}
              group={group}
              isActive={isActive}
            />
          ))}
        </nav>

        {/* User Profile Link */}
        {orgSlug && (
          <div className="border-t pt-4 mt-4">
            <Link
              to={`${orgBasePath}/profile`}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive(`${orgBasePath}/profile`)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Users className="h-4 w-4" />
              Profile & Sessions
            </Link>
          </div>
        )}

        {/* Footer */}
        <div className="border-t pt-4 mt-4">
          <p className="text-xs text-muted-foreground text-center">
            Z0 Auth v1.0.0
          </p>
        </div>
      </div>
    </aside>
  );
}

function NavGroupComponent({
  group,
  isActive,
}: {
  group: NavGroup;
  isActive: (href: string) => boolean;
}) {
  // Check if any item in the group is active
  const hasActiveItem = group.items.some((item) => isActive(item.href));

  return (
    <Collapsible defaultOpen={group.defaultOpen || hasActiveItem}>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
        {group.title}
        <ChevronRight className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 mt-1">
        {group.items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {item.title}
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {item.badge}
                </Badge>
              )}
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
