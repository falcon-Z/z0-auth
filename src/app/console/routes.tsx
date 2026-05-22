import { Route, Routes } from "react-router-dom";

import { ConsoleHomePage } from "./pages/home";
import { ConsoleNotFoundPage } from "./pages/not-found";

export function ConsoleRoutes() {
  return (
    <Routes>
      <Route index element={<ConsoleHomePage />} />
      <Route path="*" element={<ConsoleNotFoundPage />} />
    </Routes>
  );
}
