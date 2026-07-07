import type { DeployStatusResponse } from "@z0/contracts/deploy-status";
import { CheckCircle2, Database, KeyRound, RefreshCw, UserRound, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Button } from "@z0/components/ui/button";
import { Card, CardContent } from "@z0/components/ui/card";
import { cn } from "../../lib/utils";

import { DatabaseSetupPanel } from "./DatabaseSetupPanel";
import { SecretsSetupPanel } from "./SecretsSetupPanel";
import { BootstrapOwnerSetupPanel } from "./BootstrapOwnerSetupPanel";

type DeploySetupPageProps = {
  status: DeployStatusResponse;
  onRefresh: () => void;
  refreshing: boolean;
};

type SetupStep = "database" | "keys" | "owner";

function stepComplete(status: DeployStatusResponse, step: SetupStep): boolean {
  if (step === "database") {
    return status.database.configured && status.database.connected && status.database.schemaReady;
  }
  if (step === "owner") {
    return Boolean(status.platform?.setupComplete || status.platform?.bootstrap.ready);
  }
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
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-auto w-full items-start gap-3 rounded-lg border px-3 py-3 text-left text-sm font-normal",
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
    </Button>
  );
}

export function DeploySetupPage({ status, onRefresh, refreshing }: DeploySetupPageProps) {
  const dbComplete = stepComplete(status, "database");
  const keysComplete = stepComplete(status, "keys");
  const bootstrapConfigured = Boolean(status.platform?.bootstrap.configured);
  const ownerComplete = stepComplete(status, "owner");

  const suggestedStep = useMemo((): SetupStep => {
    if (!dbComplete) return "database";
    if (!keysComplete) return "keys";
    if (bootstrapConfigured && !ownerComplete) return "owner";
    return "database";
  }, [bootstrapConfigured, dbComplete, keysComplete, ownerComplete]);

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
              Complete each step on the left. When deployment setup is done, you will continue
              automatically.
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
            {bootstrapConfigured ? (
              <StepNavButton
                active={activeStep === "owner"}
                complete={ownerComplete}
                label="First owner"
                icon={UserRound}
                muted={!dbComplete || !keysComplete}
                onClick={() => {
                  if (dbComplete && keysComplete) setActiveStep("owner");
                }}
              />
            ) : null}
          </div>
        </nav>

        <main className="min-w-0 flex-1">
        <Card className="gap-0 py-0 shadow-sm">
          <CardContent className="p-6 sm:p-8">
          {activeStep === "database" ? (
            <DatabaseSetupPanel status={status} />
          ) : activeStep === "keys" && !dbComplete ? (
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
          ) : activeStep === "keys" ? (
            <SecretsSetupPanel status={status} />
          ) : !dbComplete || !keysComplete ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight">First owner</h2>
              <Alert>
                <AlertTitle>Deployment setup first</AlertTitle>
                <AlertDescription>
                  Complete database and encryption key setup before creating the first owner.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <BootstrapOwnerSetupPanel status={status} />
          )}
          </CardContent>
        </Card>
        </main>
      </div>
    </div>
  );
}
