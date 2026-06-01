import { Route, Routes } from "react-router-dom";

import { CreateTenantPage } from "./pages/CreateTenantPage";
import { TenantDetailPage } from "./pages/TenantDetailPage";
import { TenantsListPage } from "./pages/TenantsListPage";

export function TenantsModule() {
  return (
    <Routes>
      <Route index element={<TenantsListPage />} />
      <Route path="new" element={<CreateTenantPage />} />
      <Route path=":tenantId" element={<TenantDetailPage />} />
    </Routes>
  );
}
