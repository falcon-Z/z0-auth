import type { SessionResponse } from "@z0/contracts/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { SessionGate } from "../components/shell/SessionGate";
import { loadSession, postActiveTenant, postLogout } from "../lib/api";

type SessionContextValue = {
  session: SessionResponse;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
  switchOrganization: (tenantId: string) => Promise<void>;
  switchError: string | null;
  switching: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [gate, setGate] = useState<"loading" | "ready">("loading");
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
    redirectForGate(result.kind);
  }, [redirectForGate]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signOut = useCallback(async () => {
    await postLogout();
    window.location.href = "/auth/login";
  }, []);

  const switchOrganization = useCallback(async (tenantId: string) => {
    setSwitchError(null);
    setSwitching(true);
    try {
      const next = await postActiveTenant(tenantId);
      setSession(next);
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : "Could not switch tenant");
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

  if (gate === "loading" || !value) {
    return <SessionGate />;
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
