import { useEffect, useState } from "react";

import { AuthLayout } from "../components/auth-layout";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@z0/components/ui/card";
import type { SetupStatus } from "@shared/contracts/setup";

export function ForgotPasswordPage() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const setupRes = await fetch("/api/setup/status", { credentials: "same-origin" });
      const setup = (await setupRes.json()) as SetupStatus;
      if (!setup.completed) {
        window.location.href = "/setup";
        return;
      }
      setChecking(false);
    })();
  }, []);

  if (checking) {
    return (
      <AuthLayout title="Reset password" description="Loading…">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset password"
      description="Email-based password reset will be available when SMTP is configured."
    >
      <Card>
        <CardHeader>
          <CardTitle>Not available yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Self-service password reset is not enabled on this platform. Configure outbound email (SMTP) in a future
            release, or contact your platform operator if you are locked out.
          </p>
        </CardContent>
        <CardFooter>
          <Button className="w-full" asChild>
            <a href="/login">Back to sign in</a>
          </Button>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
