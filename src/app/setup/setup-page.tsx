import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthLayout } from "@z0/auth/components/auth-layout";
import { PasswordChecklist } from "@z0/components/password-checklist";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@z0/components/ui/card";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { apiFetch, ensureCsrf } from "@z0/lib/api";
import type { SetupResponse, SetupStatus } from "@shared/contracts/setup";
import { isPasswordPolicyMet } from "@shared/contracts/password-policy";

export function SetupPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  useEffect(() => {
    (async () => {
      await ensureCsrf();
      const res = await fetch("/api/setup/status", { credentials: "same-origin" });
      const status = (await res.json()) as SetupStatus;
      if (status.completed) {
        window.location.href = "/login";
        return;
      }
      setLoading(false);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError("Passwords do not match");
      return;
    }
    if (!isPasswordPolicyMet(password, { email, name })) {
      setError("Password does not meet all requirements");
      return;
    }

    setSubmitting(true);
    const result = await apiFetch<SetupResponse>("/api/setup", {
      method: "POST",
      json: { name, email, password, passwordConfirm, organizationName },
    });
    setSubmitting(false);

    if (!result.ok) {
      const msg =
        result.problem.errors?.map((err) => err.message).join(". ") ??
        result.problem.detail ??
        result.problem.title;
      setError(msg);
      return;
    }

    navigate("/setup/complete", {
      replace: true,
      state: { ...result.data, email },
    });
  }

  if (loading) {
    return (
      <AuthLayout title="Platform setup" description="Loading…">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Checking setup status…</CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Platform setup"
      description="Create your organization and the super admin account"
    >
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Initial setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organizationName">Organization name</Label>
              <Input
                id="organizationName"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                required
                autoComplete="organization"
                placeholder="Acme Corp"
              />
              <p className="text-xs text-muted-foreground">
                A default tenant is created with this name. The super admin and future platform users belong to it.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <PasswordChecklist password={password} context={{ email, name }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">Confirm password</Label>
              <Input
                id="passwordConfirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
          <CardFooter>
            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting ? "Creating organization…" : "Complete setup"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </AuthLayout>
  );
}
