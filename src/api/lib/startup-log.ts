import type { AppConfig } from "./config";
import { serverBaseUrl } from "./config";
import type { ReadinessResult } from "./readiness";
import { getInstanceKeySources } from "./instance-keys";
import { bootstrapOwnerStatus } from "./config";

/** Safe database target for logs (no credentials). */
export function formatDatabaseTarget(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    const name = url.pathname.replace(/^\//, "") || "postgres";
    const port = url.port || "5432";
    return `${url.hostname}:${port}/${name}`;
  } catch {
    return "unknown";
  }
}

export function printStartupSummary(config: AppConfig, readiness: ReadinessResult): void {
  const url = serverBaseUrl(config);
  const db = readiness.checks.database;
  const lines: string[] = [
    `${config.appName} (${config.nodeEnv})`,
    `  Server       live    ${url}`,
    `  Readiness    ${readiness.ready ? "ready" : "not ready"}`,
  ];

  if (!db.configured) {
    lines.push("  Database     not configured   set DATABASE_URL (see console or docs/deployment.md)");
  } else if (db.connected && config.databaseUrl) {
    const target = formatDatabaseTarget(config.databaseUrl);
    lines.push(`  Database     connected   ${target} (${db.latencyMs}ms)`);
  } else {
    lines.push("  Database     unavailable   check PostgreSQL and DATABASE_URL");
  }
  lines.push(`  Schema       ${db.schemaReady ? "current" : "not ready   run bun run db:migrate"}`);

  const keySources = getInstanceKeySources();
  if (keySources) {
    const dataLabel =
      keySources.dataKey === "env"
        ? "env (stable)"
        : keySources.dataKey === "missing"
          ? "missing — set INSTANCE_DATA_KEY"
          : keySources.dataKey;
    const tokenLabel =
      keySources.tokenKeys === "env"
        ? "env (shared)"
        : keySources.tokenKeys === "missing"
          ? "missing — set token key env vars"
          : keySources.tokenKeys;
    lines.push(`  Data key     ${dataLabel}   SMTP / secrets encryption`);
    lines.push(`  Token keys   ${tokenLabel}   signed reset links`);
    if (config.nodeEnv === "production" && (keySources.dataKey === "generated" || keySources.tokenKeys === "generated")) {
      lines.push(
        "  WARNING   Keys were auto-generated on this pod; set env keys or a shared keys file before scaling to multiple replicas.",
      );
    }
  }

  const configuration = readiness.checks.configuration;
  lines.push(
    `  Public origin ${config.publicOrigin ? "configured" : "request origin (development/test only)"}`,
  );
  lines.push(`  SMTP         ${configuration.smtpMode ?? "configuration error"}`);
  const bootstrap = bootstrapOwnerStatus(config.bootstrapOwner);
  lines.push(
    `  First owner  ${!bootstrap.configured ? "manual setup" : bootstrap.ready ? "configured" : "incomplete"}`,
  );

  console.log(lines.join("\n"));
}
