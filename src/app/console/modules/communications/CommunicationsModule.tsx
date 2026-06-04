import { Route, Routes } from "react-router-dom";

import { EmailSettingsPage } from "./pages/EmailSettingsPage";

export function CommunicationsModule() {
  return (
    <Routes>
      <Route index element={<EmailSettingsPage />} />
    </Routes>
  );
}
