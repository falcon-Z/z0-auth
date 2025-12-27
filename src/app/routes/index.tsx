import { createBrowserRouter, RouterProvider } from "react-router";
import App from "../App";
import { isSuperAdminConfigured } from "../../utils/config-state";
import { Navigate, Outlet, useLocation } from "react-router";
import { ErrorBoundary } from "../components/shared/error-boundary";
import { OrgLayout, DashboardRedirect } from "../components/layout/org-layout";
import { AuthProvider, useAuth } from "../contexts/auth-context";
import { Loader2 } from "lucide-react";

import Setup from "../pages/setup";
import Login from "../pages/login";
import VerifyEmail from "../pages/auth/verify-email";
import ForgotPassword from "../pages/auth/forgot-password";
import ResetPassword from "../pages/auth/reset-password";
import Dashboard from "../pages/dashboard";
import OrganizationsList from "../pages/dashboard/organizations";
import OrganizationDetail from "../pages/dashboard/organizations/detail";
import ApplicationsPage from "../pages/dashboard/apps";
import AppDetail from "../pages/dashboard/apps/[appId]";
import OrgUserManagement from "../pages/dashboard/users";
import ProfilePage from "../pages/dashboard/profile";
import SessionsPage from "../pages/dashboard/sessions";
import InvitationsPage from "../pages/dashboard/invitations";
import RolesPage from "../pages/dashboard/roles";
import ScopesPage from "../pages/dashboard/scopes";
import ApiKeysPage from "../pages/dashboard/api-keys";
import WebhooksPage from "../pages/dashboard/webhooks";
import ProvidersPage from "../pages/dashboard/providers";
import SettingsPage from "../pages/dashboard/settings";

import AdminDashboard from "../pages/admin";
import PlatformOrganizations from "../pages/admin/platform/organizations";
import PlatformOrganizationDetail from "../pages/admin/organizations/[id]";
import PlatformUsers from "../pages/admin/platform/users";
import SMTPSettings from "../pages/admin/settings/smtp";
import RequestTracesPage from "../pages/admin/request-traces";
import AcceptInvite from "../pages/accept-invite";

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
 * Uses centralized auth context to prevent multiple localStorage reads
 */
function AuthGuard() {
  const location = useLocation();
  const { user, isLoading, isAuthenticated } = useAuth();

  // Show loading state while auth is initializing
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated && location.pathname !== "/login") {
    return <Navigate to="/login" replace />;
  }

  if (isAuthenticated && location.pathname === "/login") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

/**
 * Wrapper that provides auth context to the router
 */
function AuthProviderWrapper() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
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
        path: "auth/verify-email",
        element: <VerifyEmail />,
      },
      {
        path: "auth/forgot-password",
        element: <ForgotPassword />,
      },
      {
        path: "auth/reset-password",
        element: <ResetPassword />,
      },
      {
        path: "accept-invite/:token",
        element: <AcceptInvite />,
      },
      // Wrap authenticated routes with AuthProvider, then AuthGuard
      {
        element: <AuthProviderWrapper />,
        children: [
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
              // Redirect root and /dashboard to org-scoped dashboard
              {
                path: "",
                element: <DashboardRedirect />,
              },
              {
                path: "dashboard",
                element: <DashboardRedirect />,
              },
              {
                path: "dashboard/*",
                element: <DashboardRedirect />,
              },

              // Org-scoped routes
              {
                path: "org/:orgSlug",
                element: <OrgLayout />,
                children: [
                  {
                    index: true,
                    element: <Navigate to="dashboard" replace />,
                  },
                  {
                    path: "dashboard",
                    element: <Dashboard />,
                  },
                  {
                    path: "members",
                    element: <OrgUserManagement />,
                  },
                  {
                    path: "apps",
                    element: <ApplicationsPage />,
                  },
                  {
                    path: "apps/:appId",
                    element: <AppDetail />,
                  },
                  {
                    path: "profile",
                    element: <ProfilePage />,
                  },
                  {
                    path: "sessions",
                    element: <SessionsPage />,
                  },
                  {
                    path: "invitations",
                    element: <InvitationsPage />,
                  },
                  {
                    path: "roles",
                    element: <RolesPage />,
                  },
                  {
                    path: "scopes",
                    element: <ScopesPage />,
                  },
                  {
                    path: "api-keys",
                    element: <ApiKeysPage />,
                  },
                  {
                    path: "webhooks",
                    element: <WebhooksPage />,
                  },
                  {
                    path: "providers",
                    element: <ProvidersPage />,
                  },
                  {
                    path: "settings",
                    element: <SettingsPage />,
                  },
                ],
              },

              // Platform admin routes (no org context)
              {
                path: "admin",
                element: <AdminDashboard />,
              },
              {
                path: "admin/organizations",
                element: <PlatformOrganizations />,
              },
              {
                path: "admin/organizations/:id",
                element: <PlatformOrganizationDetail />,
              },
              {
                path: "admin/platform/organizations",
                element: <PlatformOrganizations />,
              },
              {
                path: "admin/users",
                element: <PlatformUsers />,
              },
              {
                path: "admin/platform/users",
                element: <PlatformUsers />,
              },
              {
                path: "admin/smtp",
                element: <SMTPSettings />,
              },
              {
                path: "admin/settings/smtp",
                element: <SMTPSettings />,
              },
              {
                path: "admin/request-traces",
                element: <RequestTracesPage />,
              },
              {
                path: "admin/audit-logs",
                element: <div className="p-6"><h1 className="text-2xl font-semibold">Audit Logs</h1><p className="text-muted-foreground mt-2">Coming soon...</p></div>,
              },
              {
                path: "*",
                element: <h1 className="text-5xl p-6">Page not found</h1>,
              },
            ],
          },
        ],
      },
        ],
      },
    ],
  },
]);
