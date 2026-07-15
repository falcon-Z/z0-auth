import type { DeployStatusResponse } from "@z0/contracts/deploy-status";

import { bootstrapOwnerStatus, loadConfig } from "./config";
import { getInstanceKeySources } from "./instance-keys";
import { getInstanceSettings } from "./instance";
import { evaluateReadiness } from "./readiness";

export async function buildDeployStatus(): Promise<DeployStatusResponse> {
  const config = loadConfig();
  const readiness = await evaluateReadiness();
  const database = readiness.checks.database;
  const keySources = getInstanceKeySources();
  const keysReady = readiness.checks.instanceKeys.ready;
  const bootstrap = bootstrapOwnerStatus(config.bootstrapOwner);

  const unstableInProduction =
    config.nodeEnv === "production" &&
    (keySources?.dataKey === "generated" || keySources?.tokenKeys === "generated");

  let platform: DeployStatusResponse["platform"] = null;
  if (database.connected && database.schemaReady) {
    try {
      const settings = await getInstanceSettings();
      platform = {
        setupComplete: settings.setupCompleted,
        bootstrap,
        ...(settings.organizationName ? { organizationName: settings.organizationName } : {}),
      };
    } catch {
      platform = null;
    }
  }

  return {
    ready: readiness.ready,
    nodeEnv: config.nodeEnv,
    database: {
      configured: database.configured,
      connected: database.connected,
      schemaReady: database.schemaReady,
      ...(database.latencyMs !== undefined ? { latencyMs: database.latencyMs } : {}),
      ...(database.code ? { code: database.code, error: database.message } : {}),
    },
    instanceKeys: {
      ready: keysReady,
      dataKey: keySources?.dataKey ?? "missing",
      tokenKeys: keySources?.tokenKeys ?? "missing",
      unstableInProduction,
    },
    configuration: readiness.checks.configuration,
    platform,
  };
}
