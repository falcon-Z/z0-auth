import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useNavigate, useLocation } from "react-router";

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
export interface StoredUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  hasPlatformAccess: boolean;
  platformRole?: string;
  organizations: Organization[];
}

/**
 * Auth context value
 */
interface AuthContextValue {
  /** Current user data */
  user: StoredUser | null;
  /** Whether auth state is loading */
  isLoading: boolean;
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Whether user has platform admin access */
  isPlatformAdmin: boolean;
  /** Get default organization */
  getDefaultOrg: () => Organization | null;
  /** Update user data */
  setUser: (user: StoredUser | null) => void;
  /** Clear auth state (logout) */
  logout: () => void;
  /** Refresh user from localStorage */
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
 * Auth provider component
 * Centralizes auth state management to prevent multiple localStorage reads
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<StoredUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize user from localStorage on mount
  useEffect(() => {
    const storedUser = getStoredUser();
    setUserState(storedUser);
    setIsLoading(false);
  }, []);

  // Listen for storage events (for multi-tab sync)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "user") {
        const newUser = e.newValue ? JSON.parse(e.newValue) : null;
        setUserState(newUser);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setUser = useCallback((newUser: StoredUser | null) => {
    if (newUser) {
      localStorage.setItem("user", JSON.stringify(newUser));
    } else {
      localStorage.removeItem("user");
    }
    setUserState(newUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore logout API errors
    }
    localStorage.removeItem("user");
    setUserState(null);
    navigate("/login");
  }, [navigate]);

  const refreshUser = useCallback(() => {
    const storedUser = getStoredUser();
    setUserState(storedUser);
  }, []);

  const value = useMemo(() => {
    const getDefaultOrg = () => {
      if (!user?.organizations?.length) return null;
      const defaultOrg = user.organizations.find((org) => org.isDefault);
      return defaultOrg || user.organizations[0] || null;
    };

    return {
      user,
      isLoading,
      isAuthenticated: !!user,
      isPlatformAdmin: Boolean(user?.platformRole),
      getDefaultOrg,
      setUser,
      logout,
      refreshUser,
    };
  }, [user, isLoading, setUser, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 * Must be used within AuthProvider
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/**
 * Hook to get user's role in a specific organization
 */
export function useOrgRole(orgSlug: string | undefined) {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user || !orgSlug) return null;
    const org = user.organizations.find((o) => o.slug === orgSlug);
    return org?.roleType || null;
  }, [user, orgSlug]);
}
