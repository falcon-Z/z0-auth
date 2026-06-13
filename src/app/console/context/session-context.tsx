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
import { loadSession, postLogout } from "../lib/api";
import { hasConsoleAccess } from "../lib/console-access";

type SessionContextValue = {
  session: SessionResponse;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function SessionRevalidator({ onRevalidate }: { onRevalidate: () => Promise<void> }) {
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

  const redirectForGate = useCallback((kind: "login" | "setup") => {
    window.location.href = kind === "setup" ? "/auth/setup" : "/auth/login";
  }, []);

  const refreshSession = useCallback(async () => {
    const result = await loadSession();
    if (result.kind === "authenticated") {
      if (!hasConsoleAccess(result.session)) {
        redirectForGate("login");
        return;
      }
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
      // Idempotent: cookie may already be cleared.
    }
    window.location.href = "/auth/login";
  }, []);

  const value = useMemo((): SessionContextValue | null => {
    if (!session?.authenticated || !session.user) return null;
    return {
      session,
      refreshSession,
      signOut,
    };
  }, [session, refreshSession, signOut]);

  if (gate === "unavailable") {
    return (
      <SessionGate message="The database became unavailable. Fix DATABASE_URL or Postgres, then refresh." />
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
