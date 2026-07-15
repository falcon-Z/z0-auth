import { describe, expect, test } from "bun:test";

import type { DeployStatusResponse } from "@z0/contracts/deploy-status";
import { suggestedSetupStep } from "../../src/app/console/modules/deploy/DeploySetupPage";

function status(overrides: Partial<DeployStatusResponse> = {}): DeployStatusResponse {
  return {
    ready: true,
    nodeEnv: "test",
    database: { configured: true, connected: true, schemaReady: true },
    instanceKeys: {
      ready: true,
      dataKey: "env",
      tokenKeys: "env",
      unstableInProduction: false,
    },
    configuration: { ready: true, issues: [] },
    platform: {
      setupComplete: false,
      bootstrap: { configured: false, ready: false, missing: [] },
    },
    ...overrides,
  };
}

describe("deployment setup step selection", () => {
  test("shows a server-setting problem before dependent checks", () => {
    expect(
      suggestedSetupStep(status({
        ready: false,
        configuration: {
          ready: false,
          issues: [{
            code: "config_invalid",
            variables: ["PORT"],
            message: "PORT is invalid.",
          }],
        },
      })),
    ).toBe("configuration");
  });

  test("moves through database, keys, and configured owner in order", () => {
    expect(suggestedSetupStep(status({ database: { configured: false, connected: false, schemaReady: false } }))).toBe("database");
    expect(suggestedSetupStep(status({ instanceKeys: { ready: false, dataKey: "missing", tokenKeys: "missing", unstableInProduction: false } }))).toBe("keys");
    expect(suggestedSetupStep(status({
      platform: {
        setupComplete: false,
        bootstrap: { configured: true, ready: false, missing: ["adminPassword"] },
      },
    }))).toBe("owner");
  });
});
