import type { DeployStatusResponse } from "@z0/contracts/deploy-status";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Label } from "@z0/components/ui/label";

import { ResourceTabs } from "../../components/crud/ResourceTabs";
import { DATABASE_GUIDES, DEPLOY_PROVIDERS } from "./deploy-guides";
import { GuideSteps } from "./GuideSteps";

type DatabaseSetupPanelProps = {
  status: DeployStatusResponse;
};

export function DatabaseSetupPanel({ status }: DatabaseSetupPanelProps) {
  const [provider, setProvider] = useState(DEPLOY_PROVIDERS[0]?.id ?? "docker");
  const dbOk = status.database.configured && status.database.connected;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Connect PostgreSQL</h2>
        <p className="text-sm text-muted-foreground">
          Point this instance at a PostgreSQL database using the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code> environment
          variable.
        </p>
      </div>

      {!status.database.configured ? (
        <Alert variant="destructive">
          <AlertTitle>DATABASE_URL is not set</AlertTitle>
          <AlertDescription>
            Add a PostgreSQL connection string to your deployment environment, restart the app, then
            click Refresh.
          </AlertDescription>
        </Alert>
      ) : null}

      {status.database.configured && !status.database.connected ? (
        <Alert variant="destructive">
          <AlertTitle>Database is not reachable</AlertTitle>
          <AlertDescription>
            {status.database.error ??
              "Check that PostgreSQL is running, credentials are correct, and the network allows connections from this host."}
          </AlertDescription>
        </Alert>
      ) : null}

      {dbOk ? (
        <Alert>
          <AlertTitle>Database connected</AlertTitle>
          <AlertDescription>
            PostgreSQL is reachable. Open <strong>Encryption keys</strong> in the sidebar if that step
            is still pending, or click Refresh to continue.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="db-hosting">Where are you running this app?</Label>
            <ResourceTabs
              tabs={DEPLOY_PROVIDERS.map((p) => ({ id: p.id, label: p.label }))}
              activeId={provider}
              onChange={(id) => setProvider(id as typeof provider)}
            />
          </div>
          <GuideSteps steps={DATABASE_GUIDES[provider]} />
        </>
      )}
    </div>
  );
}
