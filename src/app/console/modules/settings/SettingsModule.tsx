import { Route, Routes } from "react-router-dom";

import { StubPage } from "../../components/layout/StubPage";
import { EmailSettingsPage } from "../communications/pages/EmailSettingsPage";
import { SettingsPage } from "./pages/SettingsPage";

export function SettingsModule() {
  return (
    <Routes>
      <Route index element={<SettingsPage />} />
      <Route path="email" element={<EmailSettingsPage />} />
      <Route
        path="sign-in-providers"
        element={
          <StubPage
            title="Sign-in providers"
            message="Google, GitHub, and other sign-in providers are not ready yet."
          />
        }
      />
      <Route
        path="app-groups"
        element={
          <StubPage
            title="App groups"
            message="Grouping related apps is not ready yet."
          />
        }
      />
      <Route
        path="security"
        element={
          <StubPage
            title="Security"
            message="Instance security settings are not ready yet."
          />
        }
      />
      <Route
        path="legal"
        element={
          <StubPage
            title="Legal"
            message="Privacy and terms pages are not ready yet."
          />
        }
      />
    </Routes>
  );
}
