import type { BootstrapOwnerField, DeployStatusResponse } from "@z0/contracts/deploy-status";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Label } from "@z0/components/ui/label";

import { ResourceTabs } from "../../components/crud/ResourceTabs";
import { BOOTSTRAP_OWNER_GUIDES, DEPLOY_PROVIDERS } from "./deploy-guides";
import { GuideSteps } from "./GuideSteps";

type BootstrapOwnerSetupPanelProps = {
  status: DeployStatusResponse;
};

const FIELD_LABELS: Record<BootstrapOwnerField, string> = {
  organizationName: "organization name",
  adminName: "admin name",
  adminEmail: "admin email",
  adminPassword: "admin password",
};

const FIELD_ENV_NAMES: Record<BootstrapOwnerField, string> = {
  organizationName: "Z0_BOOTSTRAP_ORG_NAME",
  adminName: "Z0_BOOTSTRAP_ADMIN_NAME",
  adminEmail: "Z0_BOOTSTRAP_ADMIN_EMAIL",
  adminPassword: "Z0_BOOTSTRAP_ADMIN_PASSWORD",
};

function formatMissing(fields: BootstrapOwnerField[]): string {
  return fields.map((field) => FIELD_LABELS[field]).join(", ");
}

export function BootstrapOwnerSetupPanel({ status }: BootstrapOwnerSetupPanelProps) {
  const [provider, setProvider] = useState(DEPLOY_PROVIDERS[0]?.id ?? "docker");
  const bootstrap = status.platform?.bootstrap;
  const missing = bootstrap?.missing ?? [];

  if (!bootstrap?.configured) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">First owner</h2>
        <Alert>
          <AlertTitle>Manual setup is available</AlertTitle>
          <AlertDescription>
            Continue to platform setup to create the first owner in the browser.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (bootstrap.ready) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">First owner</h2>
        <Alert>
          <AlertTitle>Bootstrap configuration is complete</AlertTitle>
          <AlertDescription>
            Restart the app or refresh once startup finishes creating the first owner.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">First owner</h2>
        <p className="text-sm text-muted-foreground">
          Finish the configured owner setup, then restart the app and refresh this page.
        </p>
      </div>

      <Alert variant="destructive">
        <AlertTitle>Bootstrap configuration is incomplete</AlertTitle>
        <AlertDescription>
          Add {formatMissing(missing)} to your deployment configuration, then restart the app.
        </AlertDescription>
      </Alert>

      {missing.length > 0 ? (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-sm font-medium">Missing variables</p>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {missing.map((field) => (
              <li key={field}>
                <code className="rounded bg-background px-1.5 py-1 text-xs">{FIELD_ENV_NAMES[field]}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="owner-hosting">Where are you running this app?</Label>
        <ResourceTabs
          tabs={DEPLOY_PROVIDERS.map((p) => ({ id: p.id, label: p.label }))}
          activeId={provider}
          onChange={(id) => setProvider(id as typeof provider)}
        />
      </div>
      <GuideSteps steps={BOOTSTRAP_OWNER_GUIDES[provider]} />
    </div>
  );
}
