import type { ConfigurationIssue } from "./runtime-config";
import { checkRuntimeConfiguration } from "./runtime-config";
import { checkDatabaseHealth, checkDatabaseSchema } from "./db";
import { areInstanceKeysReady } from "./instance-keys";

export type ReadinessChecks = {
  database: {
    configured: boolean;
    connected: boolean;
    schemaReady: boolean;
    latencyMs?: number;
    code?: "database_missing" | "database_unavailable" | "schema_not_ready";
    message?: string;
  };
  instanceKeys: {
    ready: boolean;
    code?: "instance_keys_missing";
    message?: string;
  };
  configuration: {
    ready: boolean;
    smtpMode?: "console" | "disabled" | "environment";
    publicOriginConfigured?: boolean;
    issues: ConfigurationIssue[];
  };
};

export type ReadinessResult = {
  ready: boolean;
  checks: ReadinessChecks;
};

export async function evaluateReadiness(): Promise<ReadinessResult> {
  const configuration = checkRuntimeConfiguration();
  const keysReady = areInstanceKeysReady();

  if (!configuration.ready) {
    return {
      ready: false,
      checks: {
        database: {
          configured: Boolean(process.env.DATABASE_URL?.trim()),
          connected: false,
          schemaReady: false,
          code: "database_unavailable",
          message: "Database readiness cannot be checked until the server settings are valid.",
        },
        instanceKeys: {
          ready: keysReady,
          ...(!keysReady
            ? {
                code: "instance_keys_missing" as const,
                message: "Instance keys are not ready.",
              }
            : {}),
        },
        configuration: {
          ready: false,
          issues: configuration.issues,
        },
      },
    };
  }

  const db = await checkDatabaseHealth();
  const schema = db.ok ? await checkDatabaseSchema() : { ready: false as const };
  const databaseCode = !db.configured
    ? "database_missing"
    : !db.ok
      ? "database_unavailable"
      : !schema.ready
        ? "schema_not_ready"
        : undefined;
  const databaseMessage = !db.configured
    ? "Set DATABASE_URL and restart the server."
    : !db.ok
      ? "The database cannot be reached. Check PostgreSQL and DATABASE_URL."
      : !schema.ready
        ? "The database schema is not current. Run bun run db:migrate."
        : undefined;

  return {
    ready: db.ok && schema.ready && keysReady,
    checks: {
      database: {
        configured: db.configured,
        connected: db.ok,
        schemaReady: schema.ready,
        ...(db.latencyMs !== undefined ? { latencyMs: db.latencyMs } : {}),
        ...(databaseCode ? { code: databaseCode, message: databaseMessage } : {}),
      },
      instanceKeys: {
        ready: keysReady,
        ...(!keysReady
          ? {
              code: "instance_keys_missing" as const,
              message: "Instance keys are not ready. Configure the required key settings.",
            }
          : {}),
      },
      configuration: {
        ready: true,
        smtpMode: configuration.value.smtpMode,
        publicOriginConfigured: Boolean(configuration.value.config.publicOrigin),
        issues: [],
      },
    },
  };
}
