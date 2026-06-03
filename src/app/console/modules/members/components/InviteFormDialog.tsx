import { useState } from "react";

import type { CreateInviteResponse } from "@z0/contracts/invites";
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

type InviteFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: { email: string; invitedName: string }) => Promise<CreateInviteResponse>;
  onCreated: (result: CreateInviteResponse) => void;
};

export function InviteFormDialog({ open, onOpenChange, onSubmit, onCreated }: InviteFormDialogProps) {
  const [email, setEmail] = useState("");
  const [invitedName, setInvitedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setEmail("");
    setInvitedName("");
    setFieldErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    try {
      const result = await onSubmit({ email, invitedName });
      reset();
      onOpenChange(false);
      onCreated(result);
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
            <DialogTitle>Invite member</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <FormField label="Name" htmlFor="invitedName" error={fieldErrors.invitedName}>
              <Input
                id="invitedName"
                value={invitedName}
                onChange={(e) => setInvitedName(e.target.value)}
                autoComplete="name"
              />
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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
