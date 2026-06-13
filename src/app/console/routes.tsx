import type { RouteObject } from "react-router-dom";
import { Navigate, useParams } from "react-router-dom";

import { CONSOLE_NAV_ITEMS } from "./config/navigation";
import { ModulePlaceholderPage } from "./components/layout/ModulePlaceholderPage";
import { DashboardPage } from "./modules/dashboard/pages/DashboardPage";
import { AppsModule } from "./modules/apps/AppsModule";
import { MembersModule } from "./modules/members/MembersModule";
import { ProfileModule } from "./modules/profile/ProfileModule";
import { CommunicationsModule } from "./modules/communications/CommunicationsModule";
import { SettingsModule } from "./modules/settings/SettingsModule";

const IMPLEMENTED_PAGES: Record<string, RouteObject["element"]> = {
  "/": <DashboardPage />,
  "/members": <MembersModule />,
  "/apps": <AppsModule />,
  "/settings": <SettingsModule />,
  "/communications/email": <CommunicationsModule />,
  "/profile": <ProfileModule />,
};

/** Nav paths wired to real pages — keep in sync with `IMPLEMENTED_PAGES`. */
export const WIRED_CONSOLE_NAV_PATHS = [
  "/",
  "/members",
  "/apps",
  "/settings",
  "/communications/email",
  "/profile",
] as const;

/** Nested module routes need a splat so in-module `<Routes>` match subpaths. */
export function routePathForNav(path: string): string {
  if (
    path === "/members" ||
    path === "/apps" ||
    path === "/communications/email" ||
    path === "/profile"
  ) {
    return `${path}/*`;
  }
  return path;
}

function LegacyAppUsersRedirect() {
  const { appId, userId, inviteId } = useParams<{
    appId?: string;
    userId?: string;
    inviteId?: string;
  }>();
  if (appId && inviteId) {
    return <Navigate to={`/apps/${appId}/users/invites/${inviteId}`} replace />;
  }
  if (appId && userId) {
    return <Navigate to={`/apps/${appId}/users/${userId}`} replace />;
  }
  if (appId) {
    return <Navigate to={`/apps/${appId}/users`} replace />;
  }
  return <Navigate to="/apps" replace />;
}

function LegacyScopesRedirect() {
  const { appId } = useParams<{ appId?: string }>();
  if (appId) {
    return <Navigate to={`/apps/${appId}/scopes`} replace />;
  }
  return <Navigate to="/apps" replace />;
}

const legacySecurityRedirects: RouteObject[] = [
  { path: "/security/account", element: <Navigate to="/profile/security" replace /> },
  { path: "/security/sessions", element: <Navigate to="/profile/sessions" replace /> },
];

const legacyAppResourceRedirects: RouteObject[] = [
  { path: "/app-users", element: <Navigate to="/apps" replace /> },
  { path: "/app-users/:appId/invites/:inviteId", element: <LegacyAppUsersRedirect /> },
  { path: "/app-users/:appId/:userId", element: <LegacyAppUsersRedirect /> },
  { path: "/app-users/:appId", element: <LegacyAppUsersRedirect /> },
  { path: "/scopes", element: <Navigate to="/apps" replace /> },
  { path: "/scopes/:appId", element: <LegacyScopesRedirect /> },
];

export const consoleRoutes: RouteObject[] = [
  ...legacySecurityRedirects,
  ...legacyAppResourceRedirects,
  ...CONSOLE_NAV_ITEMS.map((item) => ({
    path: routePathForNav(item.path),
    element: IMPLEMENTED_PAGES[item.path] ?? <ModulePlaceholderPage item={item} />,
  })),
];
