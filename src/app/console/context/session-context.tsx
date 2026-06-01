import type { SessionResponse } from "@z0/contracts/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import { SessionGate } from "../components/shell/SessionGate";
import { loadSession, postActiveTenant, postLogout } from "../lib/api";

type SessionContextValue = {
  session: SessionResponse;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
  switchOrganization: (tenantId: string) => Promise<boolean>;
  switchError: string | null;
  switching: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/** Re-check session with the server after in-app navigation or tab focus (revoked cookies). */
function SessionRevalidator({ onRevalidate }: { onRevalidate: () => Promise<void> }) {
  const { pathname } = useLocation();
  const initialPath = useRef(pathname);

  useEffect(() => {
    if (pathname === initialPath.current) return;
    initialPath.current = pathname;
    void onRevalidate();
  }, [pathname, onRevalidate]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void onRevalidate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [onRevalidate]);

  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [gate, setGate] = useState<"loading" | "ready" | "unavailable">("loading");
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const redirectForGate = useCallback((kind: "login" | "setup") => {
    window.location.href = kind === "setup" ? "/auth/setup" : "/auth/login";
  }, []);

  const refreshSession = useCallback(async () => {
    const result = await loadSession();
    if (result.kind === "authenticated") {
      setSession(result.session);
      setGate("ready");
      return;
    }
    if (result.kind === "unavailable") {
      setGate("unavailable");
      return;
    }
    redirectForGate(result.kind);
  }, [redirectForGate]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signOut = useCallback(async () => {
    try {
      await postLogout();
    } catch {
      // Idempotent: cookie may already be cleared (e.g. revoke current session).
    }
    window.location.href = "/auth/login";
  }, []);

  const switchOrganization = useCallback(async (tenantId: string): Promise<boolean> => {
    setSwitchError(null);
    setSwitching(true);
    try {
      const next = await postActiveTenant(tenantId);
      setSession(next);
      return true;
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : "Could not switch to that tenant.");
      return false;
    } finally {
      setSwitching(false);
    }
  }, []);

  const value = useMemo((): SessionContextValue | null => {
    if (!session?.authenticated || !session.user) return null;
    return {
      session,
      refreshSession,
      signOut,
      switchOrganization,
      switchError,
      switching,
    };
  }, [session, refreshSession, signOut, switchOrganization, switchError, switching]);

  if (gate === "unavailable") {
    return (
      <SessionGate
        message="The database is unavailable. Start PostgreSQL, then refresh this page."
      />
    );
  }

  if (gate === "loading" || !value) {
    return <SessionGate />;
  }

  return (
    <SessionContext.Provider value={value}>
      <SessionRevalidator onRevalidate={refreshSession} />
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
