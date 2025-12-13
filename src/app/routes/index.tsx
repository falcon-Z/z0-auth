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
 * Uses config state which is persisted in localStorage
 */
function SetupGuard() {
  const location = useLocation();
  if (!isSuperAdminConfigured() && location.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  return <Outlet />;
}

/**
 * Guard that redirects to /login if super admin is already configured
 * Uses config state which is persisted in localStorage
 */
function SetupRedirectGuard() {
  if (isSuperAdminConfigured()) {
    return <Navigate to="/login" replace />;
  }
  return <Setup />;
}

/**
 * Guard that checks if user is authenticated
 * Since tokens are stored as HttpOnly cookies, we check for user data in localStorage
 */
function AuthGuard() {
  const location = useLocation();
  const user = localStorage.getItem("user");

  if (!user && location.pathname !== "/login") {
    return <Navigate to="/login" replace />;
  }

  if (user && location.pathname === "/login") {
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
