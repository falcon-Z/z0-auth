import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { SessionProvider } from "./context/session-context";
import { ConsoleLayout } from "./components/layout/ConsoleLayout";
import { dashboardRoutes } from "./modules/dashboard/routes";
import { clientsRoutes } from "./modules/clients/routes";

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route element={<ConsoleLayout />}>
            {[...dashboardRoutes, ...clientsRoutes].map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
