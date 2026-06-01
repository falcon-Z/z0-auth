import { Navigate, Route, Routes } from "react-router-dom";

import { AccountSecurityPage } from "../security/pages/AccountSecurityPage";
import { SessionsPage } from "../security/pages/SessionsPage";
import { ProfileHomePage } from "./pages/ProfileHomePage";

export function ProfileModule() {
  return (
    <Routes>
      <Route index element={<ProfileHomePage />} />
      <Route path="security" element={<AccountSecurityPage />} />
      <Route path="sessions" element={<SessionsPage />} />
      <Route path="*" element={<Navigate to="/profile" replace />} />
    </Routes>
  );
}
