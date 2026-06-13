import { Outlet } from "react-router-dom";

import { TooltipProvider } from "@z0/components/ui/tooltip";
import { ConfirmProvider } from "../feedback/ConfirmDialog";
import { ConsoleContent } from "../layout/ConsoleContent";
import { BreadcrumbProvider } from "../../context/breadcrumb-context";
import { AppHeader } from "./AppHeader";

export function AppShell() {
  return (
    <ConfirmProvider>
      <TooltipProvider delayDuration={0}>
        <BreadcrumbProvider>
          <div className="flex min-h-svh flex-col bg-background">
            <AppHeader />
            <main className="flex flex-1 flex-col">
              <ConsoleContent>
                <Outlet />
              </ConsoleContent>
            </main>
          </div>
        </BreadcrumbProvider>
      </TooltipProvider>
    </ConfirmProvider>
  );
}
