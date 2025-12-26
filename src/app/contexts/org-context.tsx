import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { useParams, useNavigate } from "react-router";

/**
 * Organization type matching backend AuthUser.organizations
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  roleType: "ORG_OWNER" | "ORG_ADMIN" | "ORG_DEVELOPER" | "ORG_MEMBER";
  isDefault: boolean;
}

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
  organizations: Organization[];
}

/**
 * Organization context value
 */
interface OrgContextValue {
  /** Current organization from URL slug */
  currentOrg: Organization | null;
  /** All organizations the user belongs to */
  organizations: Organization[];
  /** User's role in current organization */
  currentRole: string | null;
  /** Whether user has platform admin access */
  isPlatformAdmin: boolean;
  /** Platform role if exists */
  platformRole: string | null;
  /** Navigate to a different organization */
  switchOrg: (orgSlug: string) => void;
  /** Get default organization */
  getDefaultOrg: () => Organization | null;
}

const OrgContext = createContext<OrgContextValue | null>(null);

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
 * Organization context provider
 * Wraps org-scoped routes to provide organization context
 */
export function OrgProvider({ children }: { children: ReactNode }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  // Memoize switchOrg separately to avoid navigate dependency in main useMemo
  const switchOrg = useCallback((newSlug: string) => {
    navigate(`/org/${newSlug}/dashboard`);
  }, [navigate]);

  const value = useMemo(() => {
    const user = getStoredUser();
    const organizations = user?.organizations || [];

    // Find current org from URL slug
    const currentOrg = orgSlug
      ? organizations.find((org) => org.slug === orgSlug) || null
      : null;

    // Get default org
    const getDefaultOrg = () => {
      const defaultOrg = organizations.find((org) => org.isDefault);
      return defaultOrg || organizations[0] || null;
    };

    return {
      currentOrg,
      organizations,
      currentRole: currentOrg?.roleType || null,
      isPlatformAdmin: Boolean(user?.platformRole),
      platformRole: user?.platformRole || null,
      switchOrg,
      getDefaultOrg,
    };
  }, [orgSlug, switchOrg]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

/**
 * Hook to access organization context
 * Must be used within OrgProvider
 */
export function useOrg(): OrgContextValue {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error("useOrg must be used within an OrgProvider");
  }
  return context;
}

/**
 * Hook to check if user can access specific features based on role
 */
export function useOrgPermissions() {
  const { currentRole, isPlatformAdmin } = useOrg();

  return useMemo(() => {
    const isOwner = currentRole === "ORG_OWNER";
    const isAdmin = currentRole === "ORG_ADMIN" || isOwner;
    const isDeveloper = currentRole === "ORG_DEVELOPER" || isAdmin;
    const isMember = currentRole === "ORG_MEMBER" || isDeveloper;

    return {
      // Access levels
      isOwner,
      isAdmin,
      isDeveloper,
      isMember,
      isPlatformAdmin,

      // Feature access
      canManageMembers: isAdmin,
      canManageRoles: isAdmin,
      canManageApps: isAdmin,
      canManageWebhooks: isDeveloper,
      canManageApiKeys: isDeveloper,
      canManageProviders: isAdmin,
      canViewSettings: isMember,
      canEditSettings: isOwner,
      canDeleteOrg: isOwner,
    };
  }, [currentRole, isPlatformAdmin]);
}
