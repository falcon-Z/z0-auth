import type { AppConfig } from "./config";
import { serverBaseUrl } from "./config";
import type { DatabaseHealth } from "./db";

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

export function printStartupSummary(config: AppConfig, db: DatabaseHealth): void {
  const url = serverBaseUrl(config);
  const lines: string[] = [`${config.appName} (${config.nodeEnv})`, `  Server    live    ${url}`];

  if (db.ok) {
    const target = formatDatabaseTarget(config.databaseUrl);
    lines.push(`  Database  connected   ${target} (${db.latencyMs}ms)`);
  } else {
    lines.push(`  Database  unavailable   ${db.error ?? "unknown error"}`);
  }

  console.log(lines.join("\n"));
}
