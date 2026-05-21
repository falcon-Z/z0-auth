import { useState } from "react";
import { useLocation } from "react-router-dom";

import { AuthLayout } from "@z0/auth/components/auth-layout";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@z0/components/ui/card";
import {
  buildRecoveryMailto,
  downloadRecoveryKeyFile,
  type SetupCompleteState,
} from "@z0/lib/recovery-key-ui";

function goToLogin() {
  window.location.href = "/login";
}

export function SetupCompletePage() {
  const location = useLocation();
  const state = location.state as SetupCompleteState | null;
  const [revealed, setRevealed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!state?.recoveryKey) {
    return (
      <AuthLayout title="Recovery key" description="This page is shown once after setup">
        <Card>
          <CardContent className="space-y-4 py-6 text-sm text-muted-foreground">
            <p>
              The recovery key was shown only once. If you saved it, use the forgot-password page to reset your
              password. Otherwise contact your operator or follow break-glass documentation.
            </p>
            <Button className="w-full" onClick={goToLogin}>
              Go to sign in
            </Button>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  const masked = state.recoveryKey.replace(/[A-Z2-7]/g, "•");

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(state.recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your recovery key:", state.recoveryKey);
    }
  }

  return (
    <AuthLayout title="Save your recovery key" description="Store this key before signing in">
      <Card>
        <CardHeader>
          <CardTitle>One-time recovery key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            This key can reset your super admin password without SMTP. It will not be shown again.
          </p>
          <div className="rounded-md border bg-muted p-3 font-mono text-xs break-all">
            {revealed ? state.recoveryKey : masked}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setRevealed((v) => !v)}>
            {revealed ? "Hide" : "Reveal"} key
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={copyKey}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button type="button" variant="secondary" size="sm" asChild>
              <a href={buildRecoveryMailto(state.email, state.organizationName, state.recoveryKey)}>Email to myself</a>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => downloadRecoveryKeyFile(state.organizationName, state.recoveryKey)}
            >
              Download file
            </Button>
          </div>
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-1">
            <p>
              <strong>Clipboard:</strong> other applications may read copied secrets. Clear your clipboard after
              saving.
            </p>
            <p>
              <strong>Email:</strong> not encrypted; only opens your mail client — you must press Send yourself.
            </p>
            <p>
              <strong>Download:</strong> plaintext file; store on an encrypted volume and delete when no longer needed.
            </p>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>I have stored my recovery key securely</span>
          </label>
        </CardContent>
        <CardFooter>
          <Button
            className="w-full"
            disabled={!acknowledged}
            onClick={goToLogin}
          >
            Continue to sign in
          </Button>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
