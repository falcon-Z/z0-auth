import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

import { passwordChecklistRules, getPasswordChecklistStates } from "@z0/contracts/password-policy";
import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { DetailPageHeader } from "../../../components/crud/DetailPageHeader";
import { FormField } from "../../../components/forms/FormField";
import { FormActions } from "../../../components/forms/FormActions";
import { PageError } from "../../../components/feedback/PageError";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import {
  changePassword,
  confirmMfaEnrollment,
  disableMfa,
  getMfaStatus,
  regenerateMfaRecoveryCodes,
  startMfaEnrollment,
  listMfaRememberedBrowsers,
  revokeMfaRememberedBrowser,
} from "../../../lib/account-api";
import { useSession } from "../../../context/session-context";
import type { MfaEnrollment, MfaStatus, RememberedBrowser } from "@z0/contracts/mfa";
import type { PasskeySummary } from "@z0/contracts/passkeys";
import {
  getPasskeys,
  registerPasskey,
  removePasskey,
  renamePasskey,
  stepUpWithPasskey,
} from "../../../lib/passkeys-api";
import { stepUpMfa } from "../../../lib/account-api";

function PasswordChecklist({ password }: { password: string }) {
  const { session } = useSession();
  const { rules } = getPasswordChecklistStates(password, {
    email: session.user?.email,
    name: session.user?.name,
  });

  return (
    <ul className="space-y-1 text-sm text-muted-foreground">
      {passwordChecklistRules.map((rule) => {
        const state = rules.find((r) => r.id === rule.id)?.state ?? "pending";
        return (
          <li key={rule.id} className={state === "met" ? "text-foreground" : undefined}>
            {state === "met" ? "✓" : "○"} {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

type AccountSecurityPageProps = {
  /** Render inside profile tab layout (no duplicate back header). */
  embedded?: boolean;
};

function EnrollmentQrCode({ provisioningUri }: { provisioningUri: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void QRCode.toCanvas(canvas, provisioningUri, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 224,
      color: { dark: "#111827", light: "#ffffff" },
    });
  }, [provisioningUri]);

  return (
    <div className="w-fit rounded-lg border bg-white p-2">
      <canvas ref={canvasRef} aria-label="Authenticator setup QR code" role="img" />
    </div>
  );
}

export function AccountSecurityPage({ embedded = false }: AccountSecurityPageProps) {
  const { session } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [rememberedBrowsers, setRememberedBrowsers] = useState<RememberedBrowser[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getMfaStatus(), listMfaRememberedBrowsers(), getPasskeys()])
      .then(([status, browsers, passkeyList]) => {
        setMfaStatus(status);
        setRememberedBrowsers(browsers.browsers);
        setPasskeys(passkeyList.passkeys);
      })
      .catch(() => setMfaError("Could not load MFA settings."));
  }, []);

  async function obtainStrongStepUp() {
    if (passkeys.length > 0) {
      await stepUpWithPasskey();
      return;
    }
    if (mfaStatus?.enabled) {
      const code = window.prompt("Enter an authentication or recovery code to continue:");
      if (!code?.trim()) throw new Error("Verification is required to change passkeys.");
      await stepUpMfa(code);
      return;
    }
    throw new Error("Sign in again before changing passkeys.");
  }

  async function addPasskey() {
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const passkey = await registerPasskey();
      setPasskeys((current) => [passkey, ...current]);
    } catch (error) {
      if (error instanceof ApiError && error.problem.errors?.some((item) => item.code === "passkey_step_up_required")) {
        try {
          await obtainStrongStepUp();
          const passkey = await registerPasskey();
          setPasskeys((current) => [passkey, ...current]);
          return;
        } catch (retryError) {
          setPasskeyError(retryError instanceof Error ? retryError.message : "Could not verify this change.");
          return;
        }
      }
      setPasskeyError(error instanceof Error ? error.message : "Could not add a passkey.");
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function editPasskey(passkey: PasskeySummary) {
    const label = window.prompt("Passkey name", passkey.label);
    if (label === null) return;
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      await renamePasskey(passkey.id, label);
      setPasskeys((current) => current.map((item) => item.id === passkey.id ? { ...item, label: label.trim() } : item));
    } catch (error) {
      setPasskeyError(error instanceof Error ? error.message : "Could not rename the passkey.");
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function deletePasskey(passkey: PasskeySummary) {
    if (!window.confirm("Remove this passkey? Other sessions for this account will be signed out.")) return;
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      await removePasskey(passkey.id);
      setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
    } catch (error) {
      if (error instanceof ApiError && error.problem.errors?.some((item) => item.code === "passkey_step_up_required")) {
        try {
          await obtainStrongStepUp();
          await removePasskey(passkey.id);
          setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
          return;
        } catch (retryError) {
          setPasskeyError(retryError instanceof Error ? retryError.message : "Could not verify this change.");
          return;
        }
      }
      setPasskeyError(error instanceof Error ? error.message : "Could not remove the passkey.");
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function refreshMfaStatus() {
    setMfaStatus(await getMfaStatus());
  }

  async function beginMfa() {
    setMfaBusy(true);
    setMfaError(null);
    try {
      setEnrollment(await startMfaEnrollment());
      setRecoveryCodes([]);
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : "Could not start MFA setup.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmMfa(event: React.FormEvent) {
    event.preventDefault();
    setMfaBusy(true);
    setMfaError(null);
    try {
      const result = await confirmMfaEnrollment(mfaCode);
      setRecoveryCodes(result.recoveryCodes);
      setEnrollment(null);
      setMfaCode("");
      await refreshMfaStatus();
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : "The authentication code is invalid.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function replaceRecoveryCodes(event: React.FormEvent) {
    event.preventDefault();
    setMfaBusy(true);
    setMfaError(null);
    try {
      const result = await regenerateMfaRecoveryCodes(mfaCode);
      setRecoveryCodes(result.recoveryCodes);
      setMfaCode("");
      await refreshMfaStatus();
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : "Could not replace recovery codes.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function turnOffMfa() {
    setMfaBusy(true);
    setMfaError(null);
    try {
      await disableMfa(mfaCode);
      setMfaCode("");
      setRecoveryCodes([]);
      await refreshMfaStatus();
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : "Could not disable MFA.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function revokeRememberedBrowser(browserId: string) {
    setMfaBusy(true);
    setMfaError(null);
    try {
      await revokeMfaRememberedBrowser(browserId);
      setRememberedBrowsers((current) => current.filter((browser) => browser.id !== browserId));
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : "Could not revoke the remembered browser.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    setSuccess(false);
    try {
      await changePassword({ currentPassword, password, passwordConfirm });
      setCurrentPassword("");
      setPassword("");
      setPasswordConfirm("");
      setSuccess(true);
    } catch (e) {
      if (e instanceof ApiError) {
        const fields = fieldErrorsFromProblem(e.problem);
        if (Object.keys(fields).length > 0) {
          setFieldErrors(fields);
        } else {
          setFormError(e.message);
        }
      } else {
        setFormError("Could not change password.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-lg space-y-6"}>
      {!embedded ? (
        <DetailPageHeader title="Password" />
      ) : (
        <p className="text-sm text-muted-foreground">
          Update your password. Other sessions are signed out when you save.
        </p>
      )}

      {success ? (
        <Alert>
          <AlertTitle>Password updated</AlertTitle>
          <AlertDescription>Other sessions were signed out.</AlertDescription>
        </Alert>
      ) : null}

      {formError ? <PageError message={formError} /> : null}

      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <FormField label="Current password" htmlFor="currentPassword" error={fieldErrors.currentPassword}>
          <Input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </FormField>
        <FormField label="New password" htmlFor="newPassword" error={fieldErrors.password}>
          <Input
            id="newPassword"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </FormField>
        {password.length > 0 ? <PasswordChecklist password={password} /> : null}
        <FormField label="Confirm new password" htmlFor="passwordConfirm" error={fieldErrors.passwordConfirm}>
          <Input
            id="passwordConfirm"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </FormField>
        <FormActions>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Change password"}
          </Button>
        </FormActions>
      </form>

      <section className="space-y-4 border-t pt-6" aria-labelledby="mfa-heading">
        <div>
          <h2 id="mfa-heading" className="text-lg font-semibold">Authenticator app</h2>
          <p className="text-sm text-muted-foreground">
            Use a time-based code after sign-in. Recovery codes provide access if your authenticator is unavailable.
          </p>
        </div>

        {mfaError ? <PageError message={mfaError} /> : null}

        {recoveryCodes.length > 0 ? (
          <Alert>
            <AlertTitle>Save your recovery codes now</AlertTitle>
            <AlertDescription>
              Each code works once. They will not be shown again.
              <pre className="mt-3 grid gap-1 whitespace-pre-wrap font-mono text-sm">
                {recoveryCodes.join("\n")}
              </pre>
            </AlertDescription>
          </Alert>
        ) : null}

        {enrollment ? (
          <form className="space-y-4" onSubmit={(event) => void confirmMfa(event)}>
            <p className="text-sm">
              Scan this QR code with your authenticator. You can also open the setup link or enter the key manually.
            </p>
            <EnrollmentQrCode provisioningUri={enrollment.provisioningUri} />
            <Button type="button" variant="outline" asChild>
              <a href={enrollment.provisioningUri}>Open authenticator app</a>
            </Button>
            <div>
              <p className="text-sm font-medium">Manual setup key</p>
              <code className="mt-1 block break-all rounded bg-muted p-3 text-sm">{enrollment.secret}</code>
            </div>
            <FormField label="Six-digit code" htmlFor="mfaEnrollmentCode">
              <Input
                id="mfaEnrollmentCode"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                required
              />
            </FormField>
            <FormActions>
              <Button type="submit" disabled={mfaBusy}>{mfaBusy ? "Verifying…" : "Verify and enable"}</Button>
              <Button type="button" variant="outline" onClick={() => setEnrollment(null)}>Cancel</Button>
            </FormActions>
          </form>
        ) : mfaStatus?.enabled ? (
          <form className="space-y-4" onSubmit={(event) => void replaceRecoveryCodes(event)}>
            <Alert>
              <AlertTitle>MFA is enabled</AlertTitle>
              <AlertDescription>
                {mfaStatus.recoveryCodesRemaining} recovery codes remain.
              </AlertDescription>
            </Alert>
            <FormField label="Authentication or recovery code" htmlFor="mfaManageCode">
              <Input
                id="mfaManageCode"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                autoComplete="one-time-code"
                required
              />
            </FormField>
            <FormActions>
              <Button type="submit" variant="outline" disabled={mfaBusy}>Replace recovery codes</Button>
              <Button type="button" variant="destructive" disabled={mfaBusy || !mfaCode} onClick={() => void turnOffMfa()}>
                Disable MFA
              </Button>
            </FormActions>
            {rememberedBrowsers.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Remembered browsers</h3>
                {rememberedBrowsers.map((browser) => (
                  <div key={browser.id} className="flex items-center justify-between rounded border p-3 text-sm">
                    <div>
                      <p className="font-medium">{browser.clientLabel}</p>
                      <p className="text-muted-foreground">Last used {new Date(browser.lastUsedAt).toLocaleString()}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={mfaBusy} onClick={() => void revokeRememberedBrowser(browser.id)}>
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </form>
        ) : (
          <Button type="button" disabled={mfaBusy || mfaStatus === null} onClick={() => void beginMfa()}>
            {mfaBusy ? "Starting…" : "Set up authenticator"}
          </Button>
        )}
      </section>

      <section className="space-y-4 border-t pt-6" aria-labelledby="passkeys-heading">
        <div>
          <h2 id="passkeys-heading" className="text-lg font-semibold">Passkeys</h2>
          <p className="text-sm text-muted-foreground">
            Sign in with your device lock, fingerprint, face, or security key. z0-auth stores only the public credential.
          </p>
        </div>
        {passkeyError ? <PageError message={passkeyError} /> : null}
        {passkeys.length > 0 ? (
          <div className="space-y-2">
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="flex items-center justify-between gap-3 rounded border p-3 text-sm">
                <div>
                  <p className="font-medium">{passkey.label}</p>
                  <p className="text-muted-foreground">
                    {passkey.lastUsedAt ? `Last used ${new Date(passkey.lastUsedAt).toLocaleString()}` : `Added ${new Date(passkey.createdAt).toLocaleString()}`}
                  </p>
                  <p className="text-muted-foreground">{passkey.backupEligible ? "Synced or backed up" : "Device-bound or backup unknown"}</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={passkeyBusy} onClick={() => void editPasskey(passkey)}>Rename</Button>
                  <Button type="button" variant="destructive" size="sm" disabled={passkeyBusy} onClick={() => void deletePasskey(passkey)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">No passkeys are registered.</p>}
        <Button type="button" disabled={passkeyBusy || passkeys.length >= 10} onClick={() => void addPasskey()}>
          {passkeyBusy ? "Working…" : "Add passkey"}
        </Button>
      </section>
    </div>
  );
}
