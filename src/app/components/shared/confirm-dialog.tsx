/**
 * ConfirmDialog component
 * Reusable confirmation dialog for destructive actions
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@z0/components/ui/alert-dialog";
import { Button } from "@z0/components/ui/button";
import { Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Description/warning text */
  description: string;
  /** Confirm action handler */
  onConfirm: () => void | Promise<void>;
  /** Whether confirmation is in progress */
  isLoading?: boolean;
  /** Confirm button label (default: "Confirm") */
  confirmLabel?: string;
  /** Cancel button label (default: "Cancel") */
  cancelLabel?: string;
  /** Button variant (default: "destructive") */
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isLoading = false,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    // Dialog will be closed by parent after successful action
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            variant={variant}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * DeleteConfirmDialog - Pre-configured for delete/revoke actions
 */
interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Name of the item being deleted (e.g., "organization", "user") */
  itemType: string;
  /** Name of the specific item (e.g., "Acme Corp") */
  itemName?: string;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  /** Custom description (overrides default) */
  description?: string;
  /** Custom confirm button label (default: "Delete") */
  confirmLabel?: string;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemType,
  itemName,
  onConfirm,
  isLoading = false,
  description: customDescription,
  confirmLabel = "Delete",
}: DeleteConfirmDialogProps) {
  const title = `Delete ${itemType}?`;
  const description = customDescription
    ? customDescription
    : itemName
      ? `Are you sure you want to delete "${itemName}"? This action cannot be undone.`
      : `Are you sure you want to delete this ${itemType}? This action cannot be undone.`;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onConfirm={onConfirm}
      isLoading={isLoading}
      confirmLabel={confirmLabel}
      variant="destructive"
    />
  );
}

export type { ConfirmDialogProps, DeleteConfirmDialogProps };
