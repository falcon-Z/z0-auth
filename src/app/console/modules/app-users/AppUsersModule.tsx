import { Route, Routes } from "react-router-dom";

import { AppUsersPage } from "./pages/AppUsersPage";
import { AppUsersPickerPage } from "./pages/AppUsersPickerPage";

export function AppUsersModule() {
  return (
    <Routes>
      <Route index element={<AppUsersPickerPage />} />
      <Route path=":appId" element={<AppUsersPage />} />
    </Routes>
  );
}
