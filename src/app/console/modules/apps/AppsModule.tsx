import { Route, Routes } from "react-router-dom";

import { AppUserDetailPage } from "../app-users/pages/AppUserDetailPage";
import { AppUserInviteDetailPage } from "../app-users/pages/AppUserInviteDetailPage";
import { AppUsersPage } from "../app-users/pages/AppUsersPage";
import { AppScopesPage } from "../scopes/pages/AppScopesPage";
import { AppDetailPage } from "./pages/AppDetailPage";
import { AppsListPage } from "./pages/AppsListPage";

export function AppsModule() {
  return (
    <Routes>
      <Route index element={<AppsListPage />} />
      <Route path=":appId" element={<AppDetailPage />} />
      <Route path=":appId/scopes" element={<AppScopesPage />} />
      <Route path=":appId/users/invites/:inviteId" element={<AppUserInviteDetailPage />} />
      <Route path=":appId/users/:userId" element={<AppUserDetailPage />} />
      <Route path=":appId/users" element={<AppUsersPage />} />
    </Routes>
  );
}
