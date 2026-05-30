import type { RouteObject } from "react-router-dom";

import { CONSOLE_NAV_ITEMS } from "./config/navigation";
import { ModulePlaceholderPage } from "./components/layout/ModulePlaceholderPage";
import { ClientsPage } from "./modules/clients/pages/ClientsPage";
import { DashboardPage } from "./modules/dashboard/pages/DashboardPage";
import { MembersPage } from "./modules/members/pages/MembersPage";

const IMPLEMENTED_PAGES: Record<string, RouteObject["element"]> = {
  "/": <DashboardPage />,
  "/members": <MembersPage />,
  "/clients": <ClientsPage />,
};

export const consoleRoutes: RouteObject[] = CONSOLE_NAV_ITEMS.map((item) => ({
  path: item.path,
  element: IMPLEMENTED_PAGES[item.path] ?? <ModulePlaceholderPage item={item} />,
}));
