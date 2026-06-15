import { useEffect, useRef, useState } from "react";

import type { AppClientType, AppDetail, CreateAppResponse } from "@z0/contracts/apps";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@z0/components/ui/select";
import { ApiError } from "../../../lib/api";
import { fieldErrorsFromProblem } from "../../../lib/form-errors";
import { FormField } from "../../../components/forms/FormField";

const DEFAULT_REDIRECT_URI = "http://localhost:3000/oauth/callback";

type CreateBody = { name: string; redirectUris: string[]; clientType: AppClientType };
type EditBody = { name: string; redirectUris: string[] };

type AppFormDialogProps =
  | {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      mode?: "create";
      initial?: Pick<AppDetail, "name" | "redirectUris">;
      onSubmit: (body: CreateBody) => Promise<CreateAppResponse>;
      onSuccess: (result: CreateAppResponse) => void;
    }
  | {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      mode: "edit";
      initial?: Pick<AppDetail, "name" | "redirectUris">;
      onSubmit: (body: EditBody) => Promise<AppDetail>;
      onSuccess: (result: AppDetail) => void;
    };

export function AppFormDialog({
  open,
  onOpenChange,
  mode = "create",
  initial,
  onSubmit,
  onSuccess,
}: AppFormDialogProps) {
  const [name, setName] = useState("");
  const [clientType, setClientType] = useState<AppClientType>("confidential");
  const [uris, setUris] = useState([DEFAULT_REDIRECT_URI]);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isEdit = mode === "edit";
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      if (isEdit && initial) {
        setName(initial.name);
        setUris(initial.redirectUris.length > 0 ? [...initial.redirectUris] : [DEFAULT_REDIRECT_URI]);
      } else {
        setName("");
        setClientType("confidential");
        setUris([DEFAULT_REDIRECT_URI]);
      }
      setFieldErrors({});
    }
    wasOpen.current = open;
  }, [open, isEdit, initial]);

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
      if (isEdit) {
        const updated = await (onSubmit as (body: EditBody) => Promise<AppDetail>)({ name, redirectUris });
        onOpenChange(false);
        (onSuccess as (result: AppDetail) => void)(updated);
      } else {
        const result = await (onSubmit as (body: CreateBody) => Promise<CreateAppResponse>)({
          name,
          redirectUris,
          clientType,
        });
        onOpenChange(false);
        (onSuccess as (result: CreateAppResponse) => void)(result);
      }
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
            <DialogTitle>{isEdit ? "Edit app" : "Add app"}</DialogTitle>
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
            {!isEdit ? (
              <div className="space-y-2">
                <Label htmlFor="clientType">Application type</Label>
                <Select value={clientType} onValueChange={(v) => setClientType(v as AppClientType)}>
                  <SelectTrigger id="clientType" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confidential">Web app (server)</SelectItem>
                    <SelectItem value="public">Single-page app (browser)</SelectItem>
                  </SelectContent>
                </Select>
                {fieldErrors.clientType ? (
                  <p className="text-sm text-destructive">{fieldErrors.clientType}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {clientType === "public"
                    ? "Runs in the browser. Uses PKCE instead of a client secret."
                    : "Runs on your server. Keep the client secret on the server only."}
                </p>
              </div>
            ) : null}
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
              {submitting ? "Saving…" : isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
