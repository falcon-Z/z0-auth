import { useState } from "react";

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
import { changePassword } from "../../../lib/account-api";
import { useSession } from "../../../context/session-context";

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

export function AccountSecurityPage({ embedded = false }: AccountSecurityPageProps) {
  const { session } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
        <FormField label="Current password" error={fieldErrors.currentPassword}>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </FormField>
        <FormField label="New password" error={fieldErrors.password}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </FormField>
        {password.length > 0 ? <PasswordChecklist password={password} /> : null}
        <FormField label="Confirm new password" error={fieldErrors.passwordConfirm}>
          <Input
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
    </div>
  );
}
