import type { RouteObject } from "react-router-dom";

import { ActivityPage } from "./modules/activity/pages/ActivityPage";
import { AppsModule } from "./modules/apps/AppsModule";
import { HomePage } from "./modules/home/pages/HomePage";
import { PeopleModule } from "./modules/people/PeopleModule";
import { ProfileModule } from "./modules/profile/ProfileModule";
import { SettingsModule } from "./modules/settings/SettingsModule";

/** Top-level console routes. */
export const consoleRoutes: RouteObject[] = [
  { path: "/", element: <HomePage /> },
  { path: "/apps/*", element: <AppsModule /> },
  { path: "/team/*", element: <PeopleModule /> },
  { path: "/settings/*", element: <SettingsModule /> },
  { path: "/activity", element: <ActivityPage /> },
  { path: "/profile/*", element: <ProfileModule /> },
];
