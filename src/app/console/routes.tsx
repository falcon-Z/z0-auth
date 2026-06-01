import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

import { CONSOLE_NAV_ITEMS } from "./config/navigation";
import { ModulePlaceholderPage } from "./components/layout/ModulePlaceholderPage";
import { ClientsPage } from "./modules/clients/pages/ClientsPage";
import { DashboardPage } from "./modules/dashboard/pages/DashboardPage";
import { MembersModule } from "./modules/members/MembersModule";
import { ProfileModule } from "./modules/profile/ProfileModule";
import { TenantsModule } from "./modules/tenants/TenantsModule";
import { UsersModule } from "./modules/users/UsersModule";

const IMPLEMENTED_PAGES: Record<string, RouteObject["element"]> = {
  "/": <DashboardPage />,
  "/members": <MembersModule />,
  "/clients": <ClientsPage />,
  "/users": <UsersModule />,
  "/tenants": <TenantsModule />,
  "/profile": <ProfileModule />,
};

/** Nav paths wired to real pages — keep in sync with `IMPLEMENTED_PAGES`. */
export const WIRED_CONSOLE_NAV_PATHS = [
  "/",
  "/members",
  "/clients",
  "/users",
  "/tenants",
  "/profile",
] as const;

/** Nested module routes need a splat so in-module `<Routes>` match subpaths. */
export function routePathForNav(path: string): string {
  if (path === "/members" || path === "/tenants" || path === "/users" || path === "/profile") {
    return `${path}/*`;
  }
  return path;
}

const legacySecurityRedirects: RouteObject[] = [
  { path: "/security/account", element: <Navigate to="/profile/security" replace /> },
  { path: "/security/sessions", element: <Navigate to="/profile/sessions" replace /> },
];

export const consoleRoutes: RouteObject[] = [
  ...legacySecurityRedirects,
  ...CONSOLE_NAV_ITEMS.map((item) => ({
    path: routePathForNav(item.path),
    element: IMPLEMENTED_PAGES[item.path] ?? <ModulePlaceholderPage item={item} />,
  })),
];
