import { useEffect, useState } from "react";

import type { RoleSummary } from "@z0/contracts/invites";
import { Button } from "@z0/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { RolePicker } from "./RolePicker";

type EditRolesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleSummary[];
  initialRoleKeys: string[];
  onSave: (roleKeys: string[]) => Promise<void>;
};

export function EditRolesDialog({ open, onOpenChange, roles, initialRoleKeys, onSave }: EditRolesDialogProps) {
  const [roleKeys, setRoleKeys] = useState(initialRoleKeys);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setRoleKeys(initialRoleKeys);
  }, [open, initialRoleKeys]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSave(roleKeys);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Edit roles</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <RolePicker roles={roles} roleKeys={roleKeys} onChange={setRoleKeys} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || roleKeys.length === 0}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
