import { Navigate, Route, Routes } from "react-router-dom";

import { AppWorkspaceRoute } from "../../components/apps/AppWorkspaceRoute";
import { AppUserDetailPage } from "../app-users/pages/AppUserDetailPage";
import { AppUserInviteDetailPage } from "../app-users/pages/AppUserInviteDetailPage";
import { AppUserInvitesPage } from "../app-users/pages/AppUserInvitesPage";
import { AppUsersPage } from "../app-users/pages/AppUsersPage";
import { AppPermissionsPage } from "../scopes/pages/AppPermissionsPage";
import { AppSetupPage } from "./pages/AppSetupPage";
import { AppSignInPage } from "./pages/AppSignInPage";
import { AppsListPage } from "./pages/AppsListPage";

export function AppsModule() {
  return (
    <Routes>
      <Route index element={<AppsListPage />} />
      <Route path=":appId/users/invites/:inviteId" element={<AppUserInviteDetailPage />} />
      <Route path=":appId/users/:userId" element={<AppUserDetailPage />} />
      <Route path=":appId" element={<AppWorkspaceRoute />}>
        <Route index element={<Navigate to="setup" replace />} />
        <Route path="setup" element={<AppSetupPage />} />
        <Route path="sign-in" element={<AppSignInPage />} />
        <Route path="users/invites" element={<AppUserInvitesPage />} />
        <Route path="users" element={<AppUsersPage />} />
        <Route path="permissions" element={<AppPermissionsPage />} />
      </Route>
    </Routes>
  );
}
