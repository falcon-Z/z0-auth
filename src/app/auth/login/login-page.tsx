import { useEffect, useState } from "react";

import { AuthLayout } from "../components/auth-layout";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@z0/components/ui/card";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { apiFetch, ensureCsrf } from "@z0/lib/api";
import type { SessionResponse } from "@shared/contracts/auth";
import type { SetupStatus } from "@shared/contracts/setup";

const SETUP_FLASH_KEY = "z0_setup_flash";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const raw = sessionStorage.getItem(SETUP_FLASH_KEY);
    if (raw) {
      sessionStorage.removeItem(SETUP_FLASH_KEY);
      try {
        const flash = JSON.parse(raw) as { organizationName?: string };
        if (flash.organizationName) {
          setSetupMessage(
            `Setup complete for ${flash.organizationName}. Sign in with your super admin account.`,
          );
        }
      } catch {
        setSetupMessage("Setup complete. Sign in with your super admin account.");
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      const setupRes = await fetch("/api/setup/status", { credentials: "same-origin" });
      const setup = (await setupRes.json()) as SetupStatus;
      if (!setup.completed) {
        window.location.href = "/setup";
        return;
      }
      const sessionRes = await fetch("/api/auth/session", { credentials: "same-origin" });
      const session = (await sessionRes.json()) as SessionResponse;
      if (session.authenticated) {
        window.location.href = "/";
        return;
      }
      await ensureCsrf();
      setChecking(false);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await apiFetch<SessionResponse>("/api/auth/login", {
      method: "POST",
      json: { email, password },
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.problem.detail ?? result.problem.title ?? "Sign in failed");
      return;
    }
    window.location.href = "/";
  }

  if (checking) {
    return (
      <AuthLayout title="Sign in" description="Loading…">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Checking session…</CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in" description="Authenticate to your z0-auth platform">
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Login</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {setupMessage ? (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-foreground">
                {setupMessage}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 text-sm text-muted-foreground">
            <a href="/forgot-password" className="hover:text-foreground">
              Forgot password?
            </a>
          </CardFooter>
        </Card>
      </form>
    </AuthLayout>
  );
}
