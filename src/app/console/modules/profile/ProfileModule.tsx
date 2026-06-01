import { Navigate, Route, Routes } from "react-router-dom";

import { AccountSecurityPage } from "../security/pages/AccountSecurityPage";
import { SessionsPage } from "../security/pages/SessionsPage";
import { ProfileLayout } from "./layout/ProfileLayout";
import { ProfileOverviewPage } from "./pages/ProfileOverviewPage";
import { ProfileTenantsPage } from "./pages/ProfileTenantsPage";

export function ProfileModule() {
  return (
    <Routes>
      <Route element={<ProfileLayout />}>
        <Route index element={<ProfileOverviewPage />} />
        <Route path="security" element={<AccountSecurityPage embedded />} />
        <Route path="sessions" element={<SessionsPage embedded />} />
        <Route path="tenants" element={<ProfileTenantsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/profile" replace />} />
    </Routes>
  );
}
