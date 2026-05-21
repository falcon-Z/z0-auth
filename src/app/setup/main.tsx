import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import "@z0/styles/theme-init";
import "@z0/styles/app.css";
import { SetupPage } from "./setup-page";
import { SetupCompletePage } from "./complete/setup-complete-page";

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/setup/complete" element={<SetupCompletePage />} />
        <Route path="*" element={<SetupPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
