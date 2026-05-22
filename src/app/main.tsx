import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";

import "@z0/styles/app.css";
import { AppShell, type AppShellVariant } from "./components/app-shell";
import { ThemeProvider } from "./providers/theme-provider";
import { AppRoutes } from "./app-routes";

function ShellFromRoute({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const variant: AppShellVariant = pathname.startsWith("/console") ? "console" : "auth";
  return <AppShell variant={variant}>{children}</AppShell>;
}

function AppRoot() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ShellFromRoute>
          <AppRoutes />
        </ShellFromRoute>
      </BrowserRouter>
    </ThemeProvider>
  );
}

const elem = document.getElementById("root")!;
const tree = (
  <StrictMode>
    <AppRoot />
  </StrictMode>
);

if (import.meta.hot) {
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(tree);
} else {
  createRoot(elem).render(tree);
}
