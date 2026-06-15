import { useState } from "react";
import { Copy } from "lucide-react";

import { Button } from "@z0/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";

type CredentialSecretDialogProps = {
  open: boolean;
  clientId: string;
  clientSecret: string | null;
  title?: string;
  onClose: () => void;
};

export function CredentialSecretDialog({
  open,
  clientId,
  clientSecret,
  title = "Copy your client secret",
  onClose,
}: CredentialSecretDialogProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const isPublic = clientSecret === null;

  async function copy(value: string, which: "id" | "secret") {
    try {
      await navigator.clipboard.writeText(value);
      if (which === "id") {
        setCopiedId(true);
        window.setTimeout(() => setCopiedId(false), 2000);
      } else {
        setCopiedSecret(true);
        window.setTimeout(() => setCopiedSecret(false), 2000);
      }
    } catch {
      if (which === "id") setCopiedId(false);
      else setCopiedSecret(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isPublic
            ? "Use this client ID with PKCE in your browser app. No client secret is issued for public clients."
            : "Store the client secret now. You will not be able to view it again."}
        </p>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Client ID</p>
            <p className="break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">{clientId}</p>
          </div>
          {!isPublic ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Client secret</p>
              <p className="break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">{clientSecret}</p>
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copy(clientId, "id")}>
            <Copy className="size-4" />
            {copiedId ? "Copied" : "Copy client ID"}
          </Button>
          {!isPublic ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void copy(clientSecret!, "secret")}>
              <Copy className="size-4" />
              {copiedSecret ? "Copied" : "Copy secret"}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
