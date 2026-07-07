import { afterEach, describe, expect, test } from "bun:test";

import { resetDatabaseConnection } from "../../src/api/lib/db";
import { hasTestDatabase } from "../helpers/db";
import { buildRequest } from "../helpers/http";
import { dispatchApi } from "./api-routes";

const run = hasTestDatabase() ? describe : describe.skip;

run("deploy status", () => {
  const prevDatabaseUrl = process.env.DATABASE_URL;
  const prevBootstrapEmail = process.env.Z0_BOOTSTRAP_ADMIN_EMAIL;

  afterEach(async () => {
    if (prevDatabaseUrl) process.env.DATABASE_URL = prevDatabaseUrl;
    else delete process.env.DATABASE_URL;
    if (prevBootstrapEmail) process.env.Z0_BOOTSTRAP_ADMIN_EMAIL = prevBootstrapEmail;
    else delete process.env.Z0_BOOTSTRAP_ADMIN_EMAIL;
    await resetDatabaseConnection();
  });

  test("GET /api/deploy/status returns readiness without setup", async () => {
    const res = await dispatchApi(buildRequest("GET", "/api/deploy/status"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ready: boolean;
      database: { configured: boolean; connected: boolean; schemaReady: boolean };
      instanceKeys: { ready: boolean };
    };
    expect(body.database.configured).toBe(true);
    expect(typeof body.database.connected).toBe("boolean");
    expect(typeof body.database.schemaReady).toBe("boolean");
    expect(typeof body.instanceKeys.ready).toBe("boolean");
    expect(body.ready).toBe(
      body.database.connected && body.database.schemaReady && body.instanceKeys.ready,
    );
  });

  test("reports database not configured when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    await resetDatabaseConnection();

    const res = await dispatchApi(buildRequest("GET", "/api/deploy/status"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ready: boolean;
      database: { configured: boolean; connected: boolean; error?: string };
    };
    expect(body.database.configured).toBe(false);
    expect(body.database.connected).toBe(false);
    expect(body.ready).toBe(false);
    expect(body.database.error).toContain("not set");
  });

  test("reports incomplete configured bootstrap owner fields", async () => {
    process.env.Z0_BOOTSTRAP_ADMIN_EMAIL = "owner@example.com";

    const res = await dispatchApi(buildRequest("GET", "/api/deploy/status"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      platform: {
        bootstrap: {
          configured: boolean;
          ready: boolean;
          missing: string[];
        };
      } | null;
    };
    expect(body.platform?.bootstrap.configured).toBe(true);
    expect(body.platform?.bootstrap.ready).toBe(false);
    expect(body.platform?.bootstrap.missing).toEqual([
      "organizationName",
      "adminName",
      "adminPassword",
    ]);
  });
});
