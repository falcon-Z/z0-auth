import { useEffect, useState, type ReactNode } from "react";

import type { SessionResponse } from "@shared/contracts/auth";
import type { SetupStatus } from "@shared/contracts/setup";

type GuardState = "loading" | "ready" | "redirect" | "error";

export function usePlatformGuard(): { state: GuardState; redirectTo?: string; error?: string } {
  const [state, setState] = useState<GuardState>("loading");
  const [redirectTo, setRedirectTo] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      try {
        const setupRes = await fetch("/api/setup/status", { credentials: "same-origin" });
        if (!setupRes.ok) {
          throw new Error(`Setup status failed (${setupRes.status})`);
        }

        const contentType = setupRes.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error("Setup status returned non-JSON response");
        }

        const setup = (await setupRes.json()) as SetupStatus;
        if (!setup.completed) {
          setRedirectTo("/setup");
          setState("redirect");
          return;
        }

        const sessionRes = await fetch("/api/auth/session", { credentials: "same-origin" });
        if (!sessionRes.ok) {
          throw new Error(`Session check failed (${sessionRes.status})`);
        }

        const session = (await sessionRes.json()) as SessionResponse;
        if (!session.authenticated) {
          setRedirectTo("/login");
          setState("redirect");
          return;
        }

        setState("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to verify platform status");
        setRedirectTo("/setup");
        setState("redirect");
      }
    })();
  }, []);

  return { state, redirectTo, error };
}

export function ConsoleAuthGuard({ children }: { children: ReactNode }) {
  const { state, redirectTo } = usePlatformGuard();

  useEffect(() => {
    if (state === "redirect" && redirectTo) {
      window.location.replace(redirectTo);
    }
  }, [state, redirectTo]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (state === "redirect") return null;

  return <>{children}</>;
}
