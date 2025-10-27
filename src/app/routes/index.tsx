import { lazy, useEffect } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import App from "../App";
import { isSuperAdminConfigured } from "../../utils/config-state";
import { Navigate, Outlet, useLocation } from "react-router";
import Setup from "../pages/setup";

/**
 * Guard that redirects to /setup if super admin is not configured
 * Prevents access to main app without setup
 */
function SetupGuard() {
  const location = useLocation();
  if (!isSuperAdminConfigured() && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  return <Outlet />;
}

/**
 * Guard that redirects to / if super admin is already configured
 * Prevents access to setup page after initial setup
 */
function SetupRedirectGuard() {
  if (isSuperAdminConfigured()) {
    return <Navigate to="/" replace />;
  }
  return <Setup />;
}

export const router = createBrowserRouter([
  {
    element: <SetupGuard />,
    children: [
      {
        path: "",
        element: <App />,
        children: [
          {
            path: "",
            element: <h1 className="text-5xl">Dashboard</h1>,
          },
          {
            path: "auth",
            element: <h1 className="text-5xl">Auth</h1>,
          },
          {
            path: "*",
            element: <h1 className="text-5xl">Page not found</h1>,
          },
        ],
      },
      {
        path: "setup",
        element: <SetupRedirectGuard />,
      },
    ],
  },
]);
