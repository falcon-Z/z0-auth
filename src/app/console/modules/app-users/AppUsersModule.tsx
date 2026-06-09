import { Route, Routes } from "react-router-dom";

import { AppUserDetailPage } from "./pages/AppUserDetailPage";
import { AppUserInviteDetailPage } from "./pages/AppUserInviteDetailPage";
import { AppUsersPage } from "./pages/AppUsersPage";
import { AppUsersPickerPage } from "./pages/AppUsersPickerPage";

export function AppUsersModule() {
  return (
    <Routes>
      <Route index element={<AppUsersPickerPage />} />
      <Route path=":appId/invites/:inviteId" element={<AppUserInviteDetailPage />} />
      <Route path=":appId/:userId" element={<AppUserDetailPage />} />
      <Route path=":appId" element={<AppUsersPage />} />
    </Routes>
  );
}
