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
import { createAppUser } from "../../../lib/app-users-api";

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
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setEmail("");
    setName("");
    setPassword("");
    setPasswordConfirm("");
    setFieldErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    try {
      await createAppUser(appId, {
        email: email.trim(),
        name: name.trim(),
        password,
        passwordConfirm,
      });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
      }
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
            Each application has its own user accounts. Set a password this person will use to sign
            in to this app only.
          </p>
          <div className="grid gap-4 py-4">
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
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
