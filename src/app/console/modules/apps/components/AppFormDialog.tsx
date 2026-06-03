import { useState } from "react";

import type { AppDetail } from "@z0/contracts/apps";
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

type AppFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: { name: string; redirectUris: string[] }) => Promise<AppDetail>;
  onCreated: (app: AppDetail) => void;
};

export function AppFormDialog({ open, onOpenChange, onSubmit, onCreated }: AppFormDialogProps) {
  const [name, setName] = useState("");
  const [uris, setUris] = useState(["http://localhost:3000/oauth/callback"]);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setName("");
    setUris(["http://localhost:3000/oauth/callback"]);
    setFieldErrors({});
  }

  function setUri(index: number, value: string) {
    setUris((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function addUri() {
    setUris((prev) => [...prev, ""]);
  }

  function removeUri(index: number) {
    setUris((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    try {
      const redirectUris = uris.map((u) => u.trim()).filter(Boolean);
      const app = await onSubmit({ name, redirectUris });
      reset();
      onOpenChange(false);
      onCreated(app);
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(fieldErrorsFromProblem(e.problem));
      } else {
        setFieldErrors({ name: "Something went wrong. Please try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Register application</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <FormField label="Name" htmlFor="appName" error={fieldErrors.name}>
              <Input
                id="appName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My product"
                autoComplete="off"
              />
            </FormField>
            <div className="space-y-2">
              <p className="text-sm font-medium">Redirect URIs</p>
              {fieldErrors.redirectUris ? (
                <p className="text-sm text-destructive">{fieldErrors.redirectUris}</p>
              ) : null}
              {uris.map((uri, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={uri}
                    onChange={(e) => setUri(index, e.target.value)}
                    placeholder="https://app.example.com/callback"
                    aria-label={`Redirect URI ${index + 1}`}
                  />
                  {uris.length > 1 ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => removeUri(index)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addUri}>
                Add URI
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
