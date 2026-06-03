import { Route, Routes } from "react-router-dom";

import { AppDetailPage } from "./pages/AppDetailPage";
import { AppsListPage } from "./pages/AppsListPage";

export function AppsModule() {
  return (
    <Routes>
      <Route index element={<AppsListPage />} />
      <Route path=":appId" element={<AppDetailPage />} />
    </Routes>
  );
}
