import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@z0/components/ui/button";
import { Input } from "@z0/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@z0/components/ui/dialog";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmationText?: string;
  confirmationLabel?: string;
};

type ConfirmState = ConfirmOptions & { open: boolean };

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setConfirmation("");
      setState({ ...options, open: true });
    });
  }, []);

  function close(result: boolean) {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Dialog
        open={Boolean(state?.open)}
        onOpenChange={(open) => {
          if (!open) close(false);
        }}
      >
        {state ? (
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{state.title}</DialogTitle>
              {state.description ? <DialogDescription>{state.description}</DialogDescription> : null}
            </DialogHeader>
            {state.confirmationText ? (
              <div className="space-y-2">
                <label htmlFor="confirm-dialog-text" className="text-sm font-medium">
                  {state.confirmationLabel ?? `Type ${state.confirmationText} to confirm`}
                </label>
                <Input
                  id="confirm-dialog-text"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                />
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                {state.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                type="button"
                variant={state.destructive ? "destructive" : "default"}
                disabled={Boolean(state.confirmationText && confirmation !== state.confirmationText)}
                onClick={() => close(true)}
              >
                {state.confirmLabel ?? "Continue"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue["confirm"] {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.confirm;
}
