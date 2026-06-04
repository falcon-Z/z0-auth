import { Route, Routes } from "react-router-dom";

import { AppScopesPage } from "./pages/AppScopesPage";
import { ScopesPickerPage } from "./pages/ScopesPickerPage";

export function ScopesModule() {
  return (
    <Routes>
      <Route index element={<ScopesPickerPage />} />
      <Route path=":appId" element={<AppScopesPage />} />
    </Routes>
  );
}
