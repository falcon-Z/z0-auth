import { Outlet, Navigate, useParams } from "react-router";
import { useMemo } from "react";
import { OrgProvider } from "../../contexts/org-context";

/**
 * Stored user data from localStorage
 */
interface StoredUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  hasPlatformAccess: boolean;
  platformRole?: string;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    roleType: string;
    isDefault: boolean;
  }>;
}

/**
 * Get stored user data from localStorage
 */
function getStoredUser(): StoredUser | null {
  try {
    const userStr = localStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
}

/**
 * Organization layout component
 * Wraps org-scoped routes with OrgProvider
 * Validates that user has access to the organization in the URL
 */
export function OrgLayout() {
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const { hasAccess, redirectTo } = useMemo(() => {
    const user = getStoredUser();
    const organizations = user?.organizations || [];

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
      if (user?.platformRole) {
        return { hasAccess: false, redirectTo: "/admin" };
      }

      return { hasAccess: false, redirectTo: "/login" };
    }

    return { hasAccess: true, redirectTo: null };
  }, [orgSlug]);

  if (!hasAccess && redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <OrgProvider>
      <Outlet />
    </OrgProvider>
  );
}

/**
 * Component to redirect from old /dashboard route to org-scoped route
 */
export function DashboardRedirect() {
  const user = getStoredUser();
  const organizations = user?.organizations || [];

  // Find default org or first org
  const defaultOrg = organizations.find((o) => o.isDefault);
  const targetOrg = defaultOrg || organizations[0];

  if (targetOrg) {
    return <Navigate to={`/org/${targetOrg.slug}/dashboard`} replace />;
  }

  // No orgs - redirect to admin if platform admin
  if (user?.platformRole) {
    return <Navigate to="/admin" replace />;
  }

  // No access at all
  return <Navigate to="/login" replace />;
}
