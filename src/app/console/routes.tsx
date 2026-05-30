import type { RouteObject } from "react-router-dom";

import { CONSOLE_NAV_ITEMS } from "./config/navigation";
import { ModulePlaceholderPage } from "./components/layout/ModulePlaceholderPage";
import { ClientsPage } from "./modules/clients/pages/ClientsPage";
import { DashboardPage } from "./modules/dashboard/pages/DashboardPage";
import { MembersModule } from "./modules/members/MembersModule";

const IMPLEMENTED_PAGES: Record<string, RouteObject["element"]> = {
  "/": <DashboardPage />,
  "/members": <MembersModule />,
  "/clients": <ClientsPage />,
};

/** Nested module routes need a splat so in-module `<Routes>` match subpaths. */
function routePathForNav(path: string): string {
  if (path === "/members") return "/members/*";
  return path;
}

export const consoleRoutes: RouteObject[] = CONSOLE_NAV_ITEMS.map((item) => ({
  path: routePathForNav(item.path),
  element: IMPLEMENTED_PAGES[item.path] ?? <ModulePlaceholderPage item={item} />,
}));
