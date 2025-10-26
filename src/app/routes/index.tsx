import { lazy, useEffect } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import App from "../App";
import { isSuperAdminConfigured } from "../../utils/config-state";
import { Navigate, Outlet, useLocation } from "react-router";
import Setup from "../pages/setup";

function SetupGuard() {
  const location = useLocation();
  if (!isSuperAdminConfigured() && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  return <Outlet />;
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
          {
            path: "setup",
            element: <Setup />,
          },
        ],
      },
    ],
  },
]);
