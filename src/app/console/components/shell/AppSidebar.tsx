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
import { cn } from "../../lib/utils";
import { CONSOLE_NAV } from "../../config/navigation";
import { useSession } from "../../context/session-context";
import { NavStatusBadge } from "../layout/NavStatusBadge";
import { SidebarWorkspace } from "./SidebarWorkspace";

function isNavItemActive(pathname: string, path: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function AppSidebar() {
  const location = useLocation();
  const { session } = useSession();
  const hasTenant = Boolean(session.tenant?.id);

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarWorkspace />
      </SidebarHeader>

      <SidebarContent>
        {CONSOLE_NAV.map((group) => (
          <SidebarGroup key={group.id}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const disabled = item.requiresTenant && !hasTenant;
                  const Icon = item.icon;
                  const isActive = isNavItemActive(location.pathname, item.path);

                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={disabled ? "Select a tenant first" : item.title}
                        className={cn(disabled && "pointer-events-none opacity-50")}
                      >
                        <NavLink
                          to={item.path}
                          end={item.path === "/"}
                          aria-disabled={disabled}
                          tabIndex={disabled ? -1 : undefined}
                          onClick={(e) => {
                            if (disabled) e.preventDefault();
                          }}
                        >
                          <Icon />
                          <span>{item.title}</span>
                          <NavStatusBadge status={item.status} className="ml-auto" />
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
