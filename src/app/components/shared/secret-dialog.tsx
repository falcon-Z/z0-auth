/**
 * SecretDialog component
 * Display one-time secrets (API keys, passwords) with copy functionality
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";
import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import { Label } from "@z0/components/ui/label";
import { Copy, Check, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@z0/components/ui/alert";

interface SecretField {
  /** Label for the field */
  label: string;
  /** The secret value */
  value: string;
  /** Whether to mask the value by default */
  masked?: boolean;
}

interface SecretDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Called when dialog closes */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Optional description */
  description?: string;
  /** Secret fields to display */
  secrets: SecretField[];
  /** Warning message (shown in alert) */
  warning?: string;
  /** Close button label */
  closeLabel?: string;
}

export function SecretDialog({
  open,
  onOpenChange,
  title,
  description,
  secrets,
  warning = "Make sure to copy these values now. You won't be able to see them again!",
  closeLabel = "I've saved these values",
}: SecretDialogProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [visibleIndices, setVisibleIndices] = useState<Set<number>>(new Set());

  const handleCopy = async (value: string, index: number) => {
    await navigator.clipboard.writeText(value);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleVisibility = (index: number) => {
    setVisibleIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleClose = () => {
    // Reset state when closing
    setCopiedIndex(null);
    setVisibleIndices(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4">
          {warning && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          )}

          {secrets.map((secret, index) => (
            <div key={index} className="space-y-2">
              <Label>{secret.label}</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  type={
                    secret.masked && !visibleIndices.has(index)
                      ? "password"
                      : "text"
                  }
                  value={secret.value}
                  className="font-mono text-sm"
                />
                {secret.masked && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => toggleVisibility(index)}
                  >
                    {visibleIndices.has(index) ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(secret.value, index)}
                >
                  {copiedIndex === index ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={handleClose}>{closeLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Simplified version for single secret
 */
interface SingleSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  value: string;
  masked?: boolean;
  warning?: string;
}

export function SingleSecretDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  value,
  masked = true,
  warning,
}: SingleSecretDialogProps) {
  return (
    <SecretDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      secrets={[{ label, value, masked }]}
      warning={warning}
    />
  );
}

export type { SecretDialogProps, SecretField, SingleSecretDialogProps };
