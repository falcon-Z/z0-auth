import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { Avatar, AvatarFallback } from "@z0/components/ui/avatar";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@z0/components/ui/sidebar";
import { initialsFromName } from "../../lib/initials";
import { useSession } from "../../context/session-context";

/** Primary account entry — users expect the name row to open their profile. */
export function SidebarIdentity() {
  const { session } = useSession();
  const name = session.user.name;
  const email = session.user.email;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild className="hover:bg-sidebar-accent">
          <Link to="/profile" aria-label="Your account">
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                {initialsFromName(name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </div>
            <ChevronRight className="ml-auto size-4 shrink-0 opacity-50" aria-hidden />
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
