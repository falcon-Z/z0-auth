import { useState } from "react";
import { Copy, Mail } from "lucide-react";

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

function buildAppInviteMailto(invite: CreateAppUserInviteResponse, appName: string): string {
  const subject = encodeURIComponent(`Join ${appName}`);
  const body = encodeURIComponent(
    `You have been invited to join ${appName}.\n\nOpen this link to create your account:\n${invite.inviteUrl}\n\nThis link expires on ${new Date(invite.expiresAt).toLocaleString()}.`,
  );
  return `mailto:${encodeURIComponent(invite.email)}?subject=${subject}&body=${body}`;
}

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
        {invite.emailDelivery === "sent" ? (
          <p className="text-sm text-muted-foreground">We emailed the invite link to {invite.email}.</p>
        ) : invite.emailDelivery === "failed" ? (
          <p className="text-sm text-muted-foreground">
            We could not email the invite. Copy the link below or open your email client.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Email is not configured yet. Copy the link below or open your email client.
          </p>
        )}
        <p className="break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
          {invite.inviteUrl}
        </p>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
            <Copy className="size-4" />
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={buildAppInviteMailto(invite, appName)}>
              <Mail className="size-4" />
              Open in email client
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
