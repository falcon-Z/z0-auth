import { useState } from "react";

import { Button } from "@z0/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { Input } from "@z0/components/ui/input";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { FormField } from "../../../components/forms/FormField";
import { addApplicationMembership, createAppUser } from "../../../lib/app-users-api";

type Props = {
  appId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export function CreateAppUserDialog({ appId, open, onOpenChange, onCreated }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [existingAccount, setExistingAccount] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setEmail("");
    setName("");
    setPassword("");
    setPasswordConfirm("");
    setExistingAccount(false);
    setAccountId("");
    setSubmitError(null);
    setFieldErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setSubmitError(null);
    try {
      if (existingAccount) {
        await addApplicationMembership(appId, accountId.trim());
      } else {
        await createAppUser(appId, {
          email: email.trim(),
          name: name.trim(),
          password,
          passwordConfirm,
        });
      }
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
      }
      setSubmitError(e instanceof ApiError ? e.message : "Could not add user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Add app user</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Create an account in this application's account domain, or add an existing account
            from that domain. Membership belongs to this application.
          </p>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" aria-pressed={!existingAccount} onClick={() => setExistingAccount(false)}>New account</Button>
            <Button type="button" variant="outline" aria-pressed={existingAccount} onClick={() => setExistingAccount(true)}>Existing account</Button>
          </div>
          <div className="grid gap-4 py-4">
            {existingAccount ? (
              <FormField label="Account ID" htmlFor="accountId" error={fieldErrors.accountId}>
                <Input id="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} autoComplete="off" required />
                <p className="text-sm text-muted-foreground">Use the Account ID from an existing user's detail page. Its credentials and stable subject will be preserved.</p>
              </FormField>
            ) : (
              <>
                <FormField label="Name" htmlFor="name" error={fieldErrors.name}>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </FormField>
                <FormField label="Email" htmlFor="email" error={fieldErrors.email}>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </FormField>
                <FormField label="Password" htmlFor="password" error={fieldErrors.password}>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </FormField>
                <FormField label="Confirm password" htmlFor="passwordConfirm" error={fieldErrors.passwordConfirm}>
                  <Input
                    id="passwordConfirm"
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </FormField>
              </>
            )}
          </div>
          {submitError ? <p role="alert" className="mb-4 text-sm text-destructive">{submitError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : existingAccount ? "Add membership" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
