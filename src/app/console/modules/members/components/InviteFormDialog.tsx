import { useState } from "react";

import type { CreateInviteResponse, RoleSummary } from "@z0/contracts/invites";
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
import { Field, RolePicker } from "./RolePicker";

type InviteFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleSummary[];
  onSubmit: (body: { email: string; invitedName: string; roleKeys: string[] }) => Promise<CreateInviteResponse>;
  onCreated: (result: CreateInviteResponse) => void;
};

export function InviteFormDialog({ open, onOpenChange, roles, onSubmit, onCreated }: InviteFormDialogProps) {
  const [email, setEmail] = useState("");
  const [invitedName, setInvitedName] = useState("");
  const [roleKeys, setRoleKeys] = useState<string[]>(["tenant_member"]);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setEmail("");
    setInvitedName("");
    setRoleKeys(["tenant_member"]);
    setFieldErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    try {
      const result = await onSubmit({ email, invitedName, roleKeys });
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
            <DialogTitle>Invite</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field label="Email" error={fieldErrors.email}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
            </Field>
            <Field label="Name" error={fieldErrors.invitedName}>
              <Input value={invitedName} onChange={(e) => setInvitedName(e.target.value)} required />
            </Field>
            <RolePicker
              roles={roles}
              roleKeys={roleKeys}
              onChange={setRoleKeys}
              error={fieldErrors.roleKeys}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || roleKeys.length === 0}>
              {submitting ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
