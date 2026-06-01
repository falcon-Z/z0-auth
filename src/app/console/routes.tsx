import type { RouteObject } from "react-router-dom";

import { CONSOLE_NAV_ITEMS } from "./config/navigation";
import { ModulePlaceholderPage } from "./components/layout/ModulePlaceholderPage";
import { ClientsPage } from "./modules/clients/pages/ClientsPage";
import { DashboardPage } from "./modules/dashboard/pages/DashboardPage";
import { MembersModule } from "./modules/members/MembersModule";
import { AccountSecurityPage } from "./modules/security/pages/AccountSecurityPage";
import { SessionsPage } from "./modules/security/pages/SessionsPage";
import { UsersModule } from "./modules/users/UsersModule";

const IMPLEMENTED_PAGES: Record<string, RouteObject["element"]> = {
  "/": <DashboardPage />,
  "/members": <MembersModule />,
  "/clients": <ClientsPage />,
  "/users": <UsersModule />,
  "/security/account": <AccountSecurityPage />,
  "/security/sessions": <SessionsPage />,
};

/** Nav paths wired to real pages — keep in sync with `IMPLEMENTED_PAGES`. */
export const WIRED_CONSOLE_NAV_PATHS = [
  "/",
  "/members",
  "/clients",
  "/users",
  "/security/account",
  "/security/sessions",
] as const;

/** Nested module routes need a splat so in-module `<Routes>` match subpaths. */
export function routePathForNav(path: string): string {
  if (path === "/members") return "/members/*";
  return path;
}

export const consoleRoutes: RouteObject[] = CONSOLE_NAV_ITEMS.map((item) => ({
  path: routePathForNav(item.path),
  element: IMPLEMENTED_PAGES[item.path] ?? <ModulePlaceholderPage item={item} />,
}));
