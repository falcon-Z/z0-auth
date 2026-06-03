import { NavLink, useLocation } from "react-router-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@z0/components/ui/sidebar";
import { CONSOLE_NAV, isConsoleNavItemVisible } from "../../config/navigation";
import { hasConsoleAccess } from "../../lib/console-access";
import { useSession } from "../../context/session-context";
import { SidebarAccountFooter } from "./SidebarAccountFooter";

function isNavItemActive(pathname: string, path: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function AppSidebar() {
  const location = useLocation();
  const { session } = useSession();
  const canAccess = hasConsoleAccess(session);

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="gap-1 border-b pb-3">
        <p className="truncate px-2 text-sm font-medium text-sidebar-foreground">
          {session.organizationName || "Console"}
        </p>
      </SidebarHeader>

      <SidebarContent>
        {CONSOLE_NAV.map((group) => {
          const items = group.items.filter((item) => {
            if (item.hideFromSidebar) return false;
            if (!isConsoleNavItemVisible(item)) return false;
            if (!canAccess && item.id !== "profile") return false;
            return true;
          });

          if (items.length === 0) return null;

          return (
            <SidebarGroup key={group.id}>
              {group.title ? <SidebarGroupLabel>{group.title}</SidebarGroupLabel> : null}
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = isNavItemActive(location.pathname, item.path);

                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                          <NavLink to={item.path} end={item.path === "/"}>
                            <Icon />
                            <span>{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarAccountFooter />
      <SidebarRail />
    </Sidebar>
  );
}
