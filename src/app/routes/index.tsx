import { useEffect } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import App from "../App";
import { isSuperAdminConfigured } from "../../utils/config-state";
import { Navigate, Outlet, useLocation } from "react-router";

import Setup from "../pages/setup";
import Login from "../pages/login";
import Dashboard from "../pages/dashboard";
import OrganizationsList from "../pages/dashboard/organizations";
import OrganizationDetail from "../pages/dashboard/organizations/detail";
import AppDetail from "../pages/dashboard/apps/[appId]";
import OrgUserManagement from "../pages/dashboard/users";
import ProfilePage from "../pages/dashboard/profile";

import AdminDashboard from "../pages/admin";
import PlatformOrganizations from "../pages/admin/platform/organizations";
import PlatformUsers from "../pages/admin/platform/users";

/**
 * Guard that redirects to /setup if super admin is not configured
 * Uses static config.json which is updated by the server on startup
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
 * Uses static config.json which is updated by the server on startup
 */
function SetupRedirectGuard() {
  if (isSuperAdminConfigured()) {
    return <Navigate to="/" replace />;
  }
  return <Setup />;
}

/**
 * Guard that checks if user is authenticated
 */
function AuthGuard() {
  const location = useLocation();
  const token = localStorage.getItem("accessToken");

  if (!token && location.pathname !== "/login") {
    return <Navigate to="/login" replace />;
  }

  if (token && location.pathname === "/login") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <SetupGuard />,
    children: [
      {
        path: "setup",
        element: <SetupRedirectGuard />,
      },
      {
        element: <AuthGuard />,
        children: [
          {
            path: "login",
            element: <Login />,
          },
          {
            path: "",
            element: <App />,
            children: [
              {
                path: "",
                element: <Dashboard />,
              },
              {
                path: "dashboard",
                element: <Dashboard />,
              },
              {
                path: "dashboard/organizations",
                element: <OrganizationsList />,
              },
              {
                path: "dashboard/organizations/:id",
                element: <OrganizationDetail />,
              },
              {
                path: "dashboard/organizations/:id/apps/:appId",
                element: <AppDetail />,
              },
              {
                path: "dashboard/users",
                element: <OrgUserManagement />,
              },
              {
                path: "dashboard/profile",
                element: <ProfilePage />,
              },
              {
                path: "admin",
                element: <AdminDashboard />,
              },
              {
                path: "admin/platform/organizations",
                element: <PlatformOrganizations />,
              },
              {
                path: "admin/platform/users",
                element: <PlatformUsers />,
              },
              {
                path: "*",
                element: <h1 className="text-5xl">Page not found</h1>,
              },
            ],
          },
        ],
      },
    ],
  },
]);
