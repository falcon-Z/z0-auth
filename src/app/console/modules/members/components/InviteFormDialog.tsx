import { useEffect, useState } from "react";

import type { CreateInviteRequest, CreateInviteResponse } from "@z0/contracts/invites";
import type { InstanceRoleSummary } from "@z0/contracts/rbac";
import { Button } from "@z0/components/ui/button";
import { Checkbox } from "@z0/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { FormField } from "../../../components/forms/FormField";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { fetchRoles } from "../../../lib/rbac-api";
import { usePermissions } from "../../../hooks/use-permissions";

type InviteFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: CreateInviteRequest) => Promise<CreateInviteResponse>;
  onCreated: (result: CreateInviteResponse) => void;
};

export function InviteFormDialog({ open, onOpenChange, onSubmit, onCreated }: InviteFormDialogProps) {
  const { hasScope } = usePermissions();
  const canPickRoles = hasScope("roles:read");
  const [email, setEmail] = useState("");
  const [invitedName, setInvitedName] = useState("");
  const [roles, setRoles] = useState<InstanceRoleSummary[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [roleLoadError, setRoleLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !canPickRoles) {
      setRoles([]);
      setSelectedRoleIds([]);
      setRoleLoadError(null);
      return;
    }
    setRoleLoadError(null);
    void fetchRoles()
      .then((items) => {
        const assignable = items.filter((role) => role.key !== "owner");
        setRoles(assignable);
        const developer = assignable.find((role) => role.key === "developer");
        setSelectedRoleIds(developer ? [developer.id] : assignable[0] ? [assignable[0].id] : []);
      })
      .catch(() => {
        setRoles([]);
        setSelectedRoleIds([]);
        setRoleLoadError("Could not load roles. Close the dialog and try again.");
      });
  }, [open, canPickRoles]);

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
      const result = await onSubmit({
        email,
        invitedName,
        ...(selectedRoleIds.length > 0 ? { roleIds: selectedRoleIds } : {}),
      });
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
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
            {canPickRoles ? (
              <FormField label="Roles" error={fieldErrors.roleIds}>
                <div className="grid gap-2">
                  {roles.map((role) => {
                    const id = `invite-role-${role.id}`;
                    return (
                      <div key={role.id} className="flex items-start gap-2 rounded-md border px-3 py-2">
                        <Checkbox
                          id={id}
                          checked={selectedRoleIds.includes(role.id)}
                          onCheckedChange={(checked) => {
                            setSelectedRoleIds((current) =>
                              checked === true
                                ? [...new Set([...current, role.id])]
                                : current.filter((value) => value !== role.id),
                            );
                          }}
                        />
                        <div>
                          <Label htmlFor={id} className="text-sm font-normal">
                            {role.name}
                          </Label>
                          {role.description ? (
                            <p className="text-xs text-muted-foreground">{role.description}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </FormField>
            ) : (
              <p className="text-sm text-muted-foreground">New members will receive the Developer role by default.</p>
            )}
            {roleLoadError ? <p className="text-sm text-destructive">{roleLoadError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                roleLoadError !== null ||
                (canPickRoles && roles.length > 0 && selectedRoleIds.length === 0)
              }
            >
              {submitting ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
