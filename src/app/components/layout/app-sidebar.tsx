import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  Building2,
  Users,
  Key,
  Shield,
  Settings,
  AppWindow,
  Layers,
} from "lucide-react";
import { cn } from "@z0/lib/utils";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Organizations",
    href: "/dashboard/organizations",
    icon: Building2,
    adminOnly: true, // Platform admin only
  },
  {
    title: "Applications",
    href: "/dashboard/apps",
    icon: AppWindow,
  },
  {
    title: "Team Members",
    href: "/dashboard/users",
    icon: Users,
  },
  {
    title: "API Keys",
    href: "/dashboard/api-keys",
    icon: Key,
  },
  {
    title: "Roles & Permissions",
    href: "/dashboard/roles",
    icon: Shield,
  },
  {
    title: "Scopes",
    href: "/dashboard/scopes",
    icon: Layers,
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const location = useLocation();

  // Get user from localStorage to check if admin
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;
  const isPlatformAdmin = user?.type === "platform";

  // Filter nav items based on user role
  const filteredNavItems = navItems.filter((item) => {
    if (item.adminOnly) {
      return isPlatformAdmin;
    }
    return true;
  });

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    return location.pathname.startsWith(href);
  };

  return (
    <aside className="w-64 border-r bg-card h-[calc(100vh-4rem)] sticky top-16">
      <div className="flex h-full flex-col gap-6 p-6">
        {/* Organization Selector - can be added later if multi-org */}
        {/* <OrganizationSelector /> */}

        {/* Navigation */}
        <nav className="flex-1 space-y-1">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.title}
              </Link>
            );
          })}
        </nav>

        {/* Footer - can add version, help links, etc. */}
        <div className="border-t pt-4">
          <p className="text-xs text-muted-foreground text-center">
            Z0 Auth v1.0.0
          </p>
        </div>
      </div>
    </aside>
  );
}
