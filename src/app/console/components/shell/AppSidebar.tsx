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
import { CONSOLE_NAV, isConsoleNavItemVisible } from "../../config/navigation";
import { shouldHideTenantsNav } from "../../lib/console-access";
import { useSession } from "../../context/session-context";
import { sessionHasPermission } from "../../lib/tenant-permissions";
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
        {CONSOLE_NAV.map((group) => {
          const items = group.items.filter((item) => {
            if (!isConsoleNavItemVisible(item)) return false;
            if (item.id === "tenants" && shouldHideTenantsNav(session)) return false;
            if (item.requiredPermission && !sessionHasPermission(session, item.requiredPermission)) {
              return false;
            }
            return true;
          });

          if (items.length === 0) return null;

          return (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const missingTenant = item.requiresTenant && !hasTenant;
                    const disabled = missingTenant;
                    const Icon = item.icon;
                    const isActive = isNavItemActive(location.pathname, item.path);

                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={disabled ? "Choose a tenant" : item.title}
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

      <SidebarRail />
    </Sidebar>
  );
}
