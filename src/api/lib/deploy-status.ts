import type { DeployStatusResponse } from "@z0/contracts/deploy-status";

import { loadConfig } from "./config";
import { checkDatabaseHealth, checkDatabaseSchema } from "./db";
import { areInstanceKeysReady, getInstanceKeySources } from "./instance-keys";
import { getInstanceSettings } from "./instance";

export async function buildDeployStatus(): Promise<DeployStatusResponse> {
  const config = loadConfig();
  const db = await checkDatabaseHealth();
  const schema = db.ok ? await checkDatabaseSchema() : { ready: false as const };
  const keySources = getInstanceKeySources();
  const keysReady = areInstanceKeysReady();

  const unstableInProduction =
    config.nodeEnv === "production" &&
    (keySources?.dataKey === "generated" || keySources?.tokenKeys === "generated");

  let platform: DeployStatusResponse["platform"] = null;
  if (db.ok && schema.ready) {
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

  const ready = db.ok && schema.ready && keysReady;

  return {
    ready,
    nodeEnv: config.nodeEnv,
    database: {
      configured: db.configured,
      connected: db.ok,
      schemaReady: schema.ready,
      ...(db.latencyMs !== undefined ? { latencyMs: db.latencyMs } : {}),
      ...(db.error ? { error: db.error } : {}),
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
