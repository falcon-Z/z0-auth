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
  const refreshSeq = useRef(0);

  const redirectForGate = useCallback((kind: "login" | "setup") => {
    window.location.replace(kind === "setup" ? "/auth/setup" : "/auth/login");
  }, []);

  const refreshSession = useCallback(async () => {
    const seq = ++refreshSeq.current;
    try {
      const result = await loadSession();
      if (seq !== refreshSeq.current) return;

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
    } catch {
      if (seq !== refreshSeq.current) return;
      setGate("unavailable");
    }
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
      <SessionGate message="Could not reach the server or database. Check that the app is running, then refresh." />
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
