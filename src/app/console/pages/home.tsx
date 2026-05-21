import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@z0/components/ui/card";
import { Button } from "@z0/components/ui/button";
import { apiFetch, ensureCsrf } from "@z0/lib/api";
import type { SessionResponse } from "@shared/contracts/auth";
import { ConsoleAuthGuard } from "@z0/lib/auth-guard";

function ConsoleHomeContent() {
  const [session, setSession] = useState<SessionResponse | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/auth/session", { credentials: "same-origin" });
      setSession((await res.json()) as SessionResponse);
    })();
  }, []);

  async function signOut() {
    await ensureCsrf();
    await apiFetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">z0-auth</p>
            <h1 className="text-lg font-semibold">Management console</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {session?.user ? (
              <span className="text-muted-foreground">
                {session.user.name}
                {session.tenant ? ` · ${session.tenant.name}` : ""} ({session.roles?.join(", ")})
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Platform console</CardTitle>
            <CardDescription>
              Signed in as platform administrator. Tenant, app, and SMTP features are coming in later phases.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>API health: <code className="rounded bg-muted px-1">GET /api/health</code></p>
            <p>Your profile: <code className="rounded bg-muted px-1">GET /api/v1/me</code></p>
            <ul className="list-disc pl-5 space-y-1 pt-2">
              <li className="opacity-60">Tenants (coming soon)</li>
              <li className="opacity-60">Apps (coming soon)</li>
              <li className="opacity-60">SMTP (coming soon)</li>
              <li className="opacity-60">API keys (coming soon)</li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export function ConsoleHomePage() {
  return (
    <ConsoleAuthGuard>
      <ConsoleHomeContent />
    </ConsoleAuthGuard>
  );
}
