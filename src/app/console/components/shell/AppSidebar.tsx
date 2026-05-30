import { NavLink, useLocation } from "react-router-dom";
import { Shield } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import { NavUser } from "./NavUser";

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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/" end>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Shield className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Z0 Auth</span>
                  <span className="truncate text-xs text-muted-foreground">Management</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
