import type { DeployStatusResponse } from "@z0/contracts/deploy-status";

import { fetchWithTimeout, withTimeout } from "./fetch-with-timeout";

export type { DeployStatusResponse, DeployProviderId } from "@z0/contracts/deploy-status";

function isDeployStatusResponse(value: unknown): value is DeployStatusResponse {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.ready !== "boolean" || typeof o.nodeEnv !== "string") return false;
  const db = o.database;
  if (!db || typeof db !== "object") return false;
  const d = db as Record<string, unknown>;
  if (typeof d.configured !== "boolean" || typeof d.connected !== "boolean") return false;
  if (typeof d.schemaReady !== "boolean") return false;
  const keys = o.instanceKeys;
  if (!keys || typeof keys !== "object") return false;
  const k = keys as Record<string, unknown>;
  return typeof k.ready === "boolean";
}

export async function loadDeployStatus(): Promise<DeployStatusResponse> {
  try {
    return await withTimeout(async () => {
      const res = await fetchWithTimeout("/api/deploy/status", {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Could not load deployment status (${res.status})`);
      }

      const data: unknown = await res.json();
      if (!isDeployStatusResponse(data)) {
        throw new Error("Invalid deployment status response");
      }
      return data;
    }, undefined, "Deploy status load");
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) {
      throw new Error("Timed out loading deployment status");
    }
    throw error;
  }
}
