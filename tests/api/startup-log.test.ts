import { describe, expect, spyOn, test } from "bun:test";

import { formatDatabaseTarget, printStartupSummary } from "../../src/api/lib/startup-log";

describe("formatDatabaseTarget", () => {
  test("redacts credentials and shows host/port/database", () => {
    const target = formatDatabaseTarget("postgresql://postgres:secret@localhost:5432/z0auth");
    expect(target).toBe("localhost:5432/z0auth");
  });
});

describe("printStartupSummary", () => {
  test("shows readiness without printing database credentials", () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      printStartupSummary(
        {
          nodeEnv: "test",
          port: 3000,
          bindAddress: "127.0.0.1",
          databaseUrl: "postgresql://postgres:do-not-print@localhost:5432/z0auth_test",
          databasePoolMax: 10,
          appName: "z0-auth",
          allowIncompleteSetup: false,
          trustProxyHops: 0,
          instanceKeysPath: ".data/test-instance-keys.json",
          bootstrapOwner: {},
        },
        {
          ready: false,
          checks: {
            database: {
              configured: true,
              connected: false,
              schemaReady: false,
              code: "database_unavailable",
              message: "The database cannot be reached.",
            },
            instanceKeys: { ready: true },
            configuration: { ready: true, smtpMode: "console", issues: [] },
          },
        },
      );
      const output = String(log.mock.calls[0]?.[0]);
      expect(output).toContain("Readiness    not ready");
      expect(output).toContain("Database     unavailable");
      expect(output).not.toContain("do-not-print");
    } finally {
      log.mockRestore();
    }
  });
});
