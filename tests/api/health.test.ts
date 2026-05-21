import { describe, expect, test } from "bun:test";

import { healthRoutes } from "../../src/api/health/routes";

describe("health routes", () => {
  test("GET /api/live returns alive", async () => {
    const handler = healthRoutes["/api/live"].GET;
    const response = await handler();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "alive" });
  });

  test("GET /api/health returns structured payload", async () => {
    const handler = healthRoutes["/api/health"].GET;
    const response = await handler();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      service: string;
      uptimeSeconds: number;
      checks: { database: { ok: boolean } };
    };
    expect(body.service).toBe("z0-auth");
    expect(["healthy", "degraded"]).toContain(body.status);
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.checks.database).toBeDefined();
  });
});
