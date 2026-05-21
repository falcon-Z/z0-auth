import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "@z0/styles/theme-init";
import "@z0/styles/app.css";
import { ConsoleRoutes } from "./routes";

const elem = document.getElementById("root")!;

const tree = (
  <StrictMode>
    <BrowserRouter>
      <ConsoleRoutes />
    </BrowserRouter>
  </StrictMode>
);

if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(tree);
} else {
  createRoot(elem).render(tree);
}
