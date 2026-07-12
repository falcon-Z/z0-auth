import type { DeployStatusResponse } from "@z0/contracts/deploy-status";

import { bootstrapOwnerStatus, loadConfig } from "./config";
import { checkDatabaseHealth, checkDatabaseSchema } from "./db";
import { areInstanceKeysReady, getInstanceKeySources } from "./instance-keys";
import { getInstanceSettings } from "./instance";
import { requestPublicOrigin } from "./config";
import { getSmtpEnvCredentials } from "./smtp-env";

export async function buildDeployStatus(): Promise<DeployStatusResponse> {
  const config = loadConfig();
  const db = await checkDatabaseHealth();
  const schema = db.ok ? await checkDatabaseSchema() : { ready: false as const };
  const keySources = getInstanceKeySources();
  const keysReady = areInstanceKeysReady();
  const bootstrap = bootstrapOwnerStatus(config.bootstrapOwner);
  let configurationReady = true;
  try {
    requestPublicOrigin(new Request("http://localhost"));
    getSmtpEnvCredentials();
  } catch {
    configurationReady = false;
  }

  const unstableInProduction =
    config.nodeEnv === "production" &&
    (keySources?.dataKey === "generated" || keySources?.tokenKeys === "generated");

  let platform: DeployStatusResponse["platform"] = null;
  if (db.ok && schema.ready) {
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

  const ready = db.ok && schema.ready && keysReady && configurationReady;

  return {
    ready,
    nodeEnv: config.nodeEnv,
    database: {
      configured: db.configured,
      connected: db.ok,
      schemaReady: schema.ready,
      ...(db.latencyMs !== undefined ? { latencyMs: db.latencyMs } : {}),
      ...(db.error ? { error: "Database connection failed." } : {}),
      ...(db.ok && !schema.ready
        ? {
            error:
              schema.error ??
              "Database schema is not applied. Run bun run db:migrate against this DATABASE_URL.",
          }
        : {}),
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
