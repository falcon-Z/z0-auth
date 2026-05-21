import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@z0/styles/theme-init";
import "@z0/styles/app.css";
import { RegisterPage } from "./register-page";

const root = document.getElementById("root")!;
createRoot(root).render(
  <StrictMode>
    <RegisterPage />
  </StrictMode>,
);
