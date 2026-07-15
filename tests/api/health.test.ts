import { afterAll, afterEach, describe, expect, test } from "bun:test";

import { closeDatabase, resetDatabaseConnection } from "../../src/api/lib/db";
import { healthApiRoutes } from "../../src/api/health/routes";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("health routes", () => {
  afterAll(async () => {
    await closeDatabase();
  });

  afterEach(async () => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    await resetDatabaseConnection();
  });

  test("GET /api/live returns alive", async () => {
    const handler = healthApiRoutes["/api/live"].GET;
    const response = await handler();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "alive" });
  });

  test("GET /api/health returns structured payload", async () => {
    const handler = healthApiRoutes["/api/health"].GET;
    const response = await handler();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      service: string;
      uptimeSeconds: number;
      checks: {
        database: { configured: boolean; connected: boolean; schemaReady: boolean };
        instanceKeys: { ready: boolean };
        configuration: { ready: boolean; issues: unknown[] };
      };
    };
    expect(body.service).toBe("z0-auth");
    expect(["healthy", "degraded"]).toContain(body.status);
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.checks.database).toBeDefined();
    expect(typeof body.checks.instanceKeys.ready).toBe("boolean");
    expect(body.checks.configuration.ready).toBe(true);
  });

  test("GET /api/ready returns the same checks and 503 when the database is missing", async () => {
    delete process.env.DATABASE_URL;
    await resetDatabaseConnection();

    const response = await healthApiRoutes["/api/ready"].GET();
    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      status: string;
      checks: {
        database: { configured: boolean; connected: boolean; schemaReady: boolean; code?: string };
        instanceKeys: { ready: boolean };
        configuration: { ready: boolean; issues: unknown[] };
      };
    };
    expect(body.status).toBe("not_ready");
    expect(body.checks.database).toMatchObject({
      configured: false,
      connected: false,
      schemaReady: false,
      code: "database_missing",
    });
    expect(typeof body.checks.instanceKeys.ready).toBe("boolean");
    expect(body.checks.configuration).toMatchObject({ ready: true, issues: [] });
  });
});
