import { Outlet, Navigate, useParams, useLocation } from "react-router";
import { useMemo } from "react";
import { OrgProvider } from "../../contexts/org-context";
import { useAuth } from "../../contexts/auth-context";
import { Loader2 } from "lucide-react";

/**
 * Organization layout component
 * Wraps org-scoped routes with OrgProvider
 * Validates that user has access to the organization in the URL
 */
export function OrgLayout() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, isLoading, isPlatformAdmin } = useAuth();
  const location = useLocation();

  const { hasAccess, redirectTo } = useMemo(() => {
    if (isLoading || !user) {
      return { hasAccess: false, redirectTo: null };
    }

    const organizations = user.organizations || [];

    // Check if user has access to this org
    const org = organizations.find((o) => o.slug === orgSlug);

    if (!org) {
      // User doesn't have access to this org
      // Redirect to default org or first available org
      const defaultOrg = organizations.find((o) => o.isDefault);
      const targetOrg = defaultOrg || organizations[0];

      if (targetOrg) {
        return {
          hasAccess: false,
          redirectTo: `/org/${targetOrg.slug}/dashboard`,
        };
      }

      // No orgs available - redirect to admin if platform admin, else login
      if (isPlatformAdmin) {
        return { hasAccess: false, redirectTo: "/admin" };
      }

      return { hasAccess: false, redirectTo: "/login" };
    }

    return { hasAccess: true, redirectTo: null };
  }, [orgSlug, user, isLoading, isPlatformAdmin]);

  // Show loading state while auth is initializing
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Handle redirect
  if (!hasAccess && redirectTo) {
    // Prevent redirect loop - if we're already at the target, show error instead
    if (location.pathname === redirectTo) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Unable to access organization</p>
        </div>
      );
    }
    return <Navigate to={redirectTo} replace />;
  }

  // If no access and no redirect target, show error
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Unable to access organization</p>
      </div>
    );
  }

  return (
    <OrgProvider>
      <Outlet />
    </OrgProvider>
  );
}

/**
 * Component to redirect from old /dashboard route to org-scoped route
 * Shows loading state to prevent layout flicker during redirect
 */
export function DashboardRedirect() {
  const { user, isLoading, isPlatformAdmin, getDefaultOrg } = useAuth();
  const location = useLocation();

  // Show loading while auth is initializing
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Find default org or first org
  const targetOrg = getDefaultOrg();

  if (targetOrg) {
    const targetPath = `/org/${targetOrg.slug}/dashboard`;
    // Prevent redirect loop
    if (location.pathname === targetPath) {
      return null;
    }
    return <Navigate to={targetPath} replace />;
  }

  // No orgs - redirect to admin if platform admin
  if (isPlatformAdmin) {
    if (location.pathname === "/admin") {
      return null;
    }
    return <Navigate to="/admin" replace />;
  }

  // No access at all - show message instead of redirecting to login (prevents loop)
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <p className="text-muted-foreground">
        You don't have access to any organizations.
      </p>
      <p className="text-sm text-muted-foreground">
        Please contact your administrator or wait for an invitation.
      </p>
    </div>
  );
}
