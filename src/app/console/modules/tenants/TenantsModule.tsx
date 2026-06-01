import { Route, Routes } from "react-router-dom";

import { CreateTenantPage } from "./pages/CreateTenantPage";
import { TenantsListPage } from "./pages/TenantsListPage";

export function TenantsModule() {
  return (
    <Routes>
      <Route index element={<TenantsListPage />} />
      <Route path="new" element={<CreateTenantPage />} />
    </Routes>
  );
}
