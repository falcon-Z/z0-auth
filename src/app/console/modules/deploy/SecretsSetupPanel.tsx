import type { DeployStatusResponse } from "@z0/contracts/deploy-status";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@z0/components/ui/alert";
import { Label } from "@z0/components/ui/label";

import { ResourceTabs } from "../../components/crud/ResourceTabs";
import { DEPLOY_PROVIDERS, SECRETS_GUIDES } from "./deploy-guides";
import { GuideSteps } from "./GuideSteps";

type SecretsSetupPanelProps = {
  status: DeployStatusResponse;
};

export function SecretsSetupPanel({ status }: SecretsSetupPanelProps) {
  const [provider, setProvider] = useState(DEPLOY_PROVIDERS[0]?.id ?? "docker");
  const keysOk = status.instanceKeys.ready;
  const isProd = status.nodeEnv === "production";

  if (!isProd && !keysOk) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Encryption keys</h2>
          <p className="text-sm text-muted-foreground">
            In development, keys are usually created automatically on first start.
          </p>
        </div>
        <Alert>
          <AlertTitle>Waiting for keys</AlertTitle>
          <AlertDescription>
            Restart the application. If this message remains, check the server log for errors during
            startup.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (keysOk) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Encryption keys</h2>
        </div>
        <Alert>
          <AlertTitle>Keys are configured</AlertTitle>
          <AlertDescription>Click Refresh to verify all steps, or wait a few seconds for an automatic check.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Set encryption keys</h2>
        <p className="text-sm text-muted-foreground">
          These keys protect sensitive settings and password-reset links. Generate them once, store
          the generated key IDs and key material in your host&apos;s secret configuration, and use the{" "}
          <strong>same values on every replica</strong>.
        </p>
      </div>

      <Alert variant="destructive">
        <AlertTitle>Keys are required in production</AlertTitle>
        <AlertDescription>
          Set{" "}
          {status.instanceKeys.dataKey === "missing" ? (
            <span>
              <code className="rounded bg-muted px-1 text-xs">INSTANCE_DATA_KEY_ID</code> /{" "}
              <code className="rounded bg-muted px-1 text-xs">INSTANCE_DATA_KEY</code>
            </span>
          ) : null}
          {status.instanceKeys.dataKey === "missing" && status.instanceKeys.tokenKeys === "missing"
            ? " and "
            : null}
          {status.instanceKeys.tokenKeys === "missing" ? (
            <span>
              <code className="rounded bg-muted px-1 text-xs">INSTANCE_TOKEN_KEY_ID</code> /{" "}
              <code className="rounded bg-muted px-1 text-xs">INSTANCE_TOKEN_PRIVATE_KEY</code> /{" "}
              <code className="rounded bg-muted px-1 text-xs">INSTANCE_TOKEN_PUBLIC_KEY</code>
            </span>
          ) : null}
          , restart the app, then refresh.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="keys-hosting">Where are you running this app?</Label>
        <ResourceTabs
          tabs={DEPLOY_PROVIDERS.map((p) => ({ id: p.id, label: p.label }))}
          activeId={provider}
          onChange={(id) => setProvider(id as typeof provider)}
        />
      </div>
      <GuideSteps steps={SECRETS_GUIDES[provider]} />
    </div>
  );
}
