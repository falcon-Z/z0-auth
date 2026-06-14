import { NavLink, useLocation } from "react-router-dom";

import { PRIMARY_NAV } from "../../config/navigation";
import { hasConsoleAccess } from "../../lib/console-access";
import { useSession } from "../../context/session-context";
import { SidebarAccountFooter } from "./SidebarAccountFooter";
import { SidebarInstanceHeader } from "./SidebarInstanceHeader";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@z0/components/ui/sidebar";

function isNavItemActive(pathname: string, path: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Sidebar nav — not mounted in the current shell. */
export function AppSidebar() {
  const location = useLocation();
  const { session } = useSession();
  const canAccess = hasConsoleAccess(session);

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b pb-3 group-data-[collapsible=icon]:px-1">
        <SidebarInstanceHeader organizationName={session.organizationName} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {PRIMARY_NAV.map((item) => {
                if (!canAccess && item.path !== "/profile") return null;
                const isActive = isNavItemActive(location.pathname, item.path);
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <NavLink to={item.path} end={item.path === "/"}>
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarAccountFooter />
      <SidebarRail />
    </Sidebar>
  );
}
