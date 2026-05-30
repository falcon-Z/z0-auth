import { useState } from "react";
import { Copy, Mail } from "lucide-react";

import type { CreateInviteResponse } from "@z0/contracts/invites";
import { Button } from "@z0/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { buildInviteMailto } from "../../../lib/members-api";

type InviteResultDialogProps = {
  invite: CreateInviteResponse | null;
  onClose: () => void;
};

export function InviteResultDialog({ invite, onClose }: InviteResultDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!invite) return null;

  async function copyLink() {
    await navigator.clipboard.writeText(invite!.inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitation created</DialogTitle>
        </DialogHeader>
        <p className="break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">{invite.inviteUrl}</p>
        <DialogFooter className="gap-2 sm:justify-start">
          <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
            <Copy className="size-4" />
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={buildInviteMailto(invite)}>
              <Mail className="size-4" />
              Email
            </a>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
