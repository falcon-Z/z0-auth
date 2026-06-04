import type { DeployStatusResponse } from "@z0/contracts/deploy-status";

import { loadConfig } from "./config";
import { checkDatabaseHealth } from "./db";
import { areInstanceKeysReady, getInstanceKeySources } from "./instance-keys";
import { getInstanceSettings } from "./instance";

export async function buildDeployStatus(): Promise<DeployStatusResponse> {
  const config = loadConfig();
  const db = await checkDatabaseHealth();
  const keySources = getInstanceKeySources();
  const keysReady = areInstanceKeysReady();

  const unstableInProduction =
    config.nodeEnv === "production" &&
    (keySources?.dataKey === "generated" || keySources?.tokenKeys === "generated");

  let platform: DeployStatusResponse["platform"] = null;
  if (db.ok) {
    try {
      const settings = await getInstanceSettings();
      platform = {
        setupComplete: settings.setupCompleted,
        ...(settings.organizationName ? { organizationName: settings.organizationName } : {}),
      };
    } catch {
      platform = null;
    }
  }

  const ready = db.ok && keysReady;

  return {
    ready,
    nodeEnv: config.nodeEnv,
    database: {
      configured: db.configured,
      connected: db.ok,
      ...(db.latencyMs !== undefined ? { latencyMs: db.latencyMs } : {}),
      ...(db.error ? { error: db.error } : {}),
    },
    instanceKeys: {
      ready: keysReady,
      dataKey: keySources?.dataKey ?? "missing",
      tokenKeys: keySources?.tokenKeys ?? "missing",
      unstableInProduction,
    },
    platform,
  };
}
