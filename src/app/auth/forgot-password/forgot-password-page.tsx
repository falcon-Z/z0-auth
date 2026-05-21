import { useEffect, useState } from "react";

import { AuthLayout } from "../components/auth-layout";
import { PasswordChecklist } from "@z0/components/password-checklist";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@z0/components/ui/card";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { apiFetch, ensureCsrf } from "@z0/lib/api";
import { isPasswordPolicyMet } from "@shared/contracts/password-policy";
import type { SetupStatus } from "@shared/contracts/setup";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const setupRes = await fetch("/api/setup/status", { credentials: "same-origin" });
      const setup = (await setupRes.json()) as SetupStatus;
      if (!setup.completed) {
        window.location.href = "/setup";
        return;
      }
      await ensureCsrf();
      setChecking(false);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== passwordConfirm) {
      setError("Passwords do not match");
      return;
    }
    if (!isPasswordPolicyMet(newPassword, { email })) {
      setError("Password does not meet all requirements");
      return;
    }

    setSubmitting(true);
    const result = await apiFetch<{ ok: boolean }>("/api/auth/reset-password", {
      method: "POST",
      json: { email, recoveryKey, newPassword, passwordConfirm },
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.problem.detail ?? result.problem.title ?? "Reset failed");
      return;
    }

    setSuccess(true);
  }

  if (checking) {
    return (
      <AuthLayout title="Reset password" description="Loading…">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout title="Password updated" description="You can sign in with your new password">
        <Card>
          <CardContent className="space-y-4 py-6 text-sm">
            <p>Your password was reset. All active sessions were revoked.</p>
            <Button className="w-full" asChild>
              <a href="/login">Go to sign in</a>
            </Button>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset password"
      description="SMTP is not configured. Use your platform recovery key."
    >
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Recovery key reset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the recovery key you saved during initial setup. Email reset links are unavailable until SMTP is
              configured.
            </p>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recoveryKey">Recovery key</Label>
              <Input
                id="recoveryKey"
                type="text"
                autoComplete="off"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                required
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <PasswordChecklist password={newPassword} context={{ email }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">Confirm new password</Label>
              <Input
                id="passwordConfirm"
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting ? "Resetting…" : "Reset password"}
            </Button>
          </CardContent>
          <CardFooter className="text-sm text-muted-foreground">
            <a href="/login" className="hover:text-foreground">
              Back to sign in
            </a>
          </CardFooter>
        </Card>
      </form>
    </AuthLayout>
  );
}
