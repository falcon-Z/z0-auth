import { useState } from "react";
import { Copy } from "lucide-react";

import type { CreateAppUserInviteResponse } from "@z0/contracts/app-users";
import { Button } from "@z0/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";

type Props = {
  invite: CreateAppUserInviteResponse | null;
  appName: string;
  onClose: () => void;
};

export function AppUserInviteResultDialog({ invite, appName, onClose }: Props) {
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
        <p className="text-sm text-muted-foreground">
          Share this link with {invite.invitedName}. They can sign up for {appName} using{" "}
          {invite.email}.
        </p>
        <p className="break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
          {invite.inviteUrl}
        </p>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
            <Copy className="size-4" />
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
