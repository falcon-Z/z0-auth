import { useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";
import { dashboardRoutes } from "@z0/modules/dashboard/routes";
import { clientsRoutes } from "@z0/modules/clients/routes";

type SessionState = "loading" | "authenticated" | "unauthenticated";

function useSessionGate(): SessionState {
  const [state, setState] = useState<SessionState>("loading");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!mounted) return;
        if (!res.ok) {
          setState("unauthenticated");
          return;
        }
        const body = (await res.json()) as { authenticated?: boolean };
        setState(body.authenticated ? "authenticated" : "unauthenticated");
      } catch {
        if (mounted) setState("unauthenticated");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}

function ConsoleShell() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold">Z0 Auth Console</h1>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link className={location.pathname === "/" ? "text-foreground" : ""} to="/">
              Dashboard
            </Link>
            <Link className={location.pathname === "/clients" ? "text-foreground" : ""} to="/clients">
              Clients
            </Link>
            <a href="/auth/logout" className="text-destructive">
              Sign out
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Management Console</CardTitle>
            <CardDescription>Manage authentication clients and platform settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <Routes>
              {[...dashboardRoutes, ...clientsRoutes].map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export function App() {
  const session = useSessionGate();

  if (session === "loading") {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading session...</div>;
  }
  if (session === "unauthenticated") {
    window.location.href = "/auth/login";
    return null;
  }

  return (
    <BrowserRouter>
      <ConsoleShell />
    </BrowserRouter>
  );
}
