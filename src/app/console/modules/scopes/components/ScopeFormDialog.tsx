import { useState } from "react";

import type { AppScopeSummary, CreateAppScopeRequest } from "@z0/contracts/app-scopes";
import { Button } from "@z0/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { Textarea } from "@z0/components/ui/textarea";
import { ApiError } from "../../../lib/api";
import { createAppScope } from "../../../lib/scopes-api";

type Props = {
  appId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (scope: AppScopeSummary) => void;
};

export function ScopeFormDialog({ appId, open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setDescription("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: CreateAppScopeRequest = {
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    try {
      const scope = await createAppScope(appId, body);
      onCreated(scope);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add scope.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Add scope</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="scope-name">Name</Label>
              <Input
                id="scope-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="read:orders"
                autoComplete="off"
                required
              />
              <p className="text-muted-foreground text-sm">
                Lowercase letters, numbers, and . _ : / -
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope-description">Description (optional)</Label>
              <Textarea
                id="scope-description"
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add scope"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
