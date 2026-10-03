import { useEffect, useState } from "react";
import type {
  Assurance,
  AppDetail,
  CreateAppRequest,
  CreateAppResponse,
  PatchAppRequest,
} from "@z0/contracts/apps";
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
import { ClientFields, defaultClient } from "./ClientFields";

type Props = { open: boolean; onOpenChange: (open: boolean) => void } & (
  | {
      mode?: "create";
      initial?: never;
      onSubmit: (body: CreateAppRequest) => Promise<CreateAppResponse>;
      onSuccess: (result: CreateAppResponse) => void;
    }
  | {
      mode: "edit";
      initial: Pick<AppDetail, "name" | "minimumAssurance">;
      onSubmit: (body: PatchAppRequest) => Promise<AppDetail>;
      onSuccess: (result: AppDetail) => void;
    }
);
export function AppFormDialog(props: Props) {
  const [name, setName] = useState("");
  const [minimum, setMinimum] = useState<Assurance>("baseline");
  const [client, setClient] = useState(defaultClient);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (props.open) {
      setName(props.initial?.name ?? "");
      setMinimum(props.initial?.minimumAssurance ?? "baseline");
      setClient(defaultClient());
      setError(null);
    }
  }, [props.open, props.initial?.name, props.initial?.minimumAssurance]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (props.mode === "edit")
        props.onSuccess(
          await props.onSubmit({ name, minimumAssurance: minimum }),
        );
      else
        props.onSuccess(
          await props.onSubmit({
            name,
            minimumAssurance: minimum,
            initialClient: client,
          }),
        );
      props.onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save application.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>
              {props.mode === "edit" ? "Edit app" : "Add app"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="appName">Name</Label>
              <Input
                id="appName"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="appMinimum">Minimum assurance</Label>
              <select
                id="appMinimum"
                className="rounded-md border p-2"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value as Assurance)}
              >
                <option value="baseline">Baseline</option>
                <option value="strong">Strong</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Applies to every interactive client in this application.
              </p>
            </div>
            {props.mode !== "edit" && (
              <>
                <h3 className="text-sm font-medium">Initial OAuth client</h3>
                <ClientFields value={client} onChange={setClient} />
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => props.onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : props.mode === "edit" ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
