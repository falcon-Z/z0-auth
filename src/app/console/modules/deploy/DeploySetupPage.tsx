import type { DeployStatusResponse } from "@z0/contracts/deploy-status";
import { CheckCircle2, Database, KeyRound, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Button } from "@z0/components/ui/button";
import { cn } from "../../lib/utils";

import { DatabaseSetupPanel } from "./DatabaseSetupPanel";
import { SecretsSetupPanel } from "./SecretsSetupPanel";

type DeploySetupPageProps = {
  status: DeployStatusResponse;
  onRefresh: () => void;
  refreshing: boolean;
};

type SetupStep = "database" | "keys";

function stepComplete(status: DeployStatusResponse, step: SetupStep): boolean {
  if (step === "database") return status.database.configured && status.database.connected;
  return status.instanceKeys.ready;
}

function StepNavButton({
  active,
  complete,
  label,
  icon: Icon,
  onClick,
  muted,
}: {
  active: boolean;
  complete: boolean;
  label: string;
  icon: typeof Database;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors",
        active ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted/60",
        muted && !active && "opacity-50",
      )}
    >
      {complete ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <XCircle
          className={cn(
            "mt-0.5 size-5 shrink-0",
            active ? "text-destructive" : "text-muted-foreground",
          )}
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium">
          <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
          {label}
        </span>
      </span>
    </button>
  );
}

export function DeploySetupPage({ status, onRefresh, refreshing }: DeploySetupPageProps) {
  const dbComplete = stepComplete(status, "database");
  const keysComplete = stepComplete(status, "keys");

  const suggestedStep = useMemo((): SetupStep => {
    if (!dbComplete) return "database";
    if (!keysComplete) return "keys";
    return "database";
  }, [dbComplete, keysComplete]);

  const [activeStep, setActiveStep] = useState<SetupStep>(suggestedStep);

  useEffect(() => {
    setActiveStep(suggestedStep);
  }, [suggestedStep]);

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Instance setup</h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Complete each step on the left. When both are done, click Refresh to continue.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-0 px-6 py-8 lg:flex-row lg:gap-10">
        <nav
          className="mb-6 shrink-0 lg:mb-0 lg:w-56"
          aria-label="Setup steps"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Steps
          </p>
          <div className="flex flex-col gap-1">
            <StepNavButton
              active={activeStep === "database"}
              complete={dbComplete}
              label="Database"
              icon={Database}
              onClick={() => setActiveStep("database")}
            />
            <StepNavButton
              active={activeStep === "keys"}
              complete={keysComplete}
              label="Encryption keys"
              icon={KeyRound}
              muted={!dbComplete}
              onClick={() => {
                if (dbComplete) setActiveStep("keys");
              }}
            />
          </div>
        </nav>

        <main className="min-w-0 flex-1 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          {activeStep === "database" ? (
            <DatabaseSetupPanel status={status} />
          ) : !dbComplete ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight">Encryption keys</h2>
              <Alert>
                <AlertTitle>Database first</AlertTitle>
                <AlertDescription>
                  Connect PostgreSQL before configuring encryption keys. Open the Database step in
                  the sidebar.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <SecretsSetupPanel status={status} />
          )}
        </main>
      </div>
    </div>
  );
}
