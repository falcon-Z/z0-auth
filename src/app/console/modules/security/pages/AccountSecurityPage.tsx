import { useState } from "react";

import { passwordChecklistRules, getPasswordChecklistStates } from "@z0/contracts/password-policy";
import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { ListPageHeader } from "../../../components/crud/ListPageHeader";
import { Field } from "../../members/components/RolePicker";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { changePassword } from "../../../lib/users-api";
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

export function AccountSecurityPage() {
  const { session } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setSuccess(false);
    try {
      await changePassword({ currentPassword, password, passwordConfirm });
      setCurrentPassword("");
      setPassword("");
      setPasswordConfirm("");
      setSuccess(true);
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <ListPageHeader title="Account security" />

      <p className="text-sm text-muted-foreground">
        Change the password for {session.user?.email}. Other signed-in sessions will be signed out.
      </p>

      {success ? (
        <Alert>
          <AlertTitle>Password updated</AlertTitle>
          <AlertDescription>Your password was changed. Other sessions have been signed out.</AlertDescription>
        </Alert>
      ) : null}

      <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
        <Field label="Current password" error={fieldErrors.currentPassword}>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="New password" error={fieldErrors.password}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        {password.length > 0 ? <PasswordChecklist password={password} /> : null}
        <Field label="Confirm new password" error={fieldErrors.passwordConfirm}>
          <Input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Change password"}
        </Button>
      </form>
    </div>
  );
}
