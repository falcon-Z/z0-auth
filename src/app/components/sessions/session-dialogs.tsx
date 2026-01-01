/**
 * Session dialogs
 * Revoke session and revoke all sessions dialogs
 */

import { ConfirmDialog, DeleteConfirmDialog } from "@z0/app/components/shared";
import type { Session } from "./session-columns";

interface RevokeSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session | null;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function RevokeSessionDialog({
  open,
  onOpenChange,
  session,
  onConfirm,
  isSubmitting = false,
}: RevokeSessionDialogProps) {
  const deviceInfo = session?.deviceInfo || session?.userAgent || "Unknown device";

  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      itemType="session"
      itemName={deviceInfo}
      onConfirm={onConfirm}
      isLoading={isSubmitting}
      confirmLabel="Revoke Session"
      description={
        session?.isCurrent
          ? "Warning: This is your current session. Revoking it will log you out immediately."
          : `This will end the session on "${deviceInfo}". The user will need to log in again on that device.`
      }
    />
  );
}

interface RevokeAllSessionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionCount: number;
  excludeCurrent?: boolean;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function RevokeAllSessionsDialog({
  open,
  onOpenChange,
  sessionCount,
  excludeCurrent = true,
  onConfirm,
  isSubmitting = false,
}: RevokeAllSessionsDialogProps) {
  const count = excludeCurrent ? sessionCount - 1 : sessionCount;
  const description = excludeCurrent
    ? `This will revoke ${count} other session${count !== 1 ? "s" : ""}. Your current session will remain active.`
    : `This will revoke all ${sessionCount} session${sessionCount !== 1 ? "s" : ""}, including your current session. You will be logged out.`;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Revoke All Sessions"
      description={description}
      onConfirm={onConfirm}
      isLoading={isSubmitting}
      confirmLabel="Revoke All"
      variant="destructive"
    />
  );
}

export type { RevokeSessionDialogProps, RevokeAllSessionsDialogProps };
