/**
 * FormDialog component
 * Reusable dialog wrapper for forms with submit handling
 */

import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { Button } from "@z0/components/ui/button";
import { Loader2 } from "lucide-react";

interface FormDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Optional description */
  description?: string;
  /** Form content */
  children: ReactNode;
  /** Form submit handler */
  onSubmit: (e: React.FormEvent) => void;
  /** Whether form is submitting */
  isSubmitting?: boolean;
  /** Submit button label (default: "Save") */
  submitLabel?: string;
  /** Cancel button label (default: "Cancel") */
  cancelLabel?: string;
  /** Submit button variant */
  submitVariant?: "default" | "destructive";
  /** Disable submit button */
  submitDisabled?: boolean;
  /** Dialog size */
  size?: "sm" | "default" | "lg" | "xl";
  /** Hide footer (for custom footer content) */
  hideFooter?: boolean;
  /** Custom footer content */
  footer?: ReactNode;
}

const sizeClasses = {
  sm: "max-w-sm",
  default: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  isSubmitting = false,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  submitVariant = "default",
  submitDisabled = false,
  size = "default",
  hideFooter = false,
  footer,
}: FormDialogProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(e);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={sizeClasses[size]}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>

          <div className="py-4">{children}</div>

          {!hideFooter && (
            <DialogFooter>
              {footer || (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                  >
                    {cancelLabel}
                  </Button>
                  <Button
                    type="submit"
                    variant={submitVariant}
                    disabled={isSubmitting || submitDisabled}
                  >
                    {isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {submitLabel}
                  </Button>
                </>
              )}
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type { FormDialogProps };
