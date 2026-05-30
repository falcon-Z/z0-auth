import { Outlet, useLocation } from "react-router-dom";

import { SidebarInset, SidebarProvider } from "@z0/components/ui/sidebar";
import { TooltipProvider } from "@z0/components/ui/tooltip";
import { useSession } from "../../context/session-context";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";

export function AppShell() {
  const location = useLocation();
  const { session } = useSession();

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <div
            className="flex flex-1 flex-col gap-4 p-4 pt-0 md:p-6"
            key={location.pathname + (session.tenant?.id ?? "")}
          >
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
