import type { SetupRequest } from "@z0/contracts/setup";

import { bootstrapOwnerStatus, loadConfig } from "../lib/config";
import { checkDatabaseHealth } from "../lib/db";
import { getInstanceSettings } from "../lib/instance";
import { createBootstrapOwner } from "./service";

export type ConfiguredBootstrapResult =
  | { status: "not-configured" }
  | { status: "incomplete"; missing: string[] }
  | { status: "database-unavailable" }
  | { status: "created" }
  | { status: "already-complete" };

export async function runConfiguredBootstrap(): Promise<ConfiguredBootstrapResult> {
  const config = loadConfig();
  const bootstrap = bootstrapOwnerStatus(config.bootstrapOwner);

  if (!bootstrap.configured) {
    return { status: "not-configured" };
  }

  const db = await checkDatabaseHealth();
  if (db.ok) {
    try {
      const settings = await getInstanceSettings();
      if (settings.setupCompleted) {
        return { status: "already-complete" };
      }
    } catch {
      /* migrations may not be applied yet; keep reporting configuration state below */
    }
  }

  if (!bootstrap.ready) {
    console.warn(
      JSON.stringify({
        event: "setup.bootstrap_config_incomplete",
        missing: bootstrap.missing,
      }),
    );
    return { status: "incomplete", missing: bootstrap.missing };
  }

  if (!db.ok) {
    return { status: "database-unavailable" };
  }

  const request: SetupRequest = {
    organizationName: config.bootstrapOwner.organizationName!,
    name: config.bootstrapOwner.adminName!,
    email: config.bootstrapOwner.adminEmail!,
    password: config.bootstrapOwner.adminPassword!,
    passwordConfirm: config.bootstrapOwner.adminPassword!,
  };

  const result = await createBootstrapOwner(request, { source: "config" });

  if (result.ok) {
    return { status: "created" };
  }

  if (result.response.status === 409) {
    return { status: "already-complete" };
  }

  if (result.response.status === 503) {
    return { status: "database-unavailable" };
  }

  const detail = await result.response.text();
  throw new Error(`Configured bootstrap failed: ${detail}`);
}
