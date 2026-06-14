import { useEffect, useState } from "react";

import { Button } from "@z0/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { Input } from "@z0/components/ui/input";
import type { PlatformResource } from "@z0/contracts/rbac";
import { FormField } from "../../../components/forms/FormField";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { createRole, fetchPlatformResources } from "../../../lib/rbac-api";
import { ScopePicker } from "./ScopePicker";

type CreateRoleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export function CreateRoleDialog({ open, onOpenChange, onCreated }: CreateRoleDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopeKeys, setScopeKeys] = useState<string[]>([]);
  const [resources, setResources] = useState<PlatformResource[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    void fetchPlatformResources().then(setResources).catch(() => setResources([]));
  }, [open]);

  function reset() {
    setName("");
    setDescription("");
    setScopeKeys([]);
    setFieldErrors({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    try {
      await createRole({ name, description, scopeKeys });
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Create role</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <FormField label="Name" htmlFor="roleName" error={fieldErrors.name}>
              <Input id="roleName" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="Description" htmlFor="roleDescription" error={fieldErrors.description}>
              <Input id="roleDescription" value={description} onChange={(e) => setDescription(e.target.value)} />
            </FormField>
            <FormField label="Permissions" error={fieldErrors.scopeKeys}>
              <ScopePicker resources={resources} selected={scopeKeys} onChange={setScopeKeys} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
