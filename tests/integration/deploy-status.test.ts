import { afterEach, describe, expect, test } from "bun:test";

import { getDb, resetDatabaseConnection } from "../../src/api/lib/db";
import { CURRENT_SCHEMA_VERSION } from "../../src/api/lib/schema-version";
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
      configuration: { ready: boolean; issues: unknown[] };
    };
    expect(body.database.configured).toBe(true);
    expect(typeof body.database.connected).toBe("boolean");
    expect(typeof body.database.schemaReady).toBe("boolean");
    expect(typeof body.instanceKeys.ready).toBe("boolean");
    expect(body.configuration).toEqual(expect.objectContaining({ ready: true, issues: [] }));
    expect(body.ready).toBe(
      body.database.connected &&
        body.database.schemaReady &&
        body.instanceKeys.ready &&
        body.configuration.ready,
    );
  });

  test("reports database not configured when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    await resetDatabaseConnection();

    const res = await dispatchApi(buildRequest("GET", "/api/deploy/status"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ready: boolean;
      database: { configured: boolean; connected: boolean; code?: string; error?: string };
    };
    expect(body.database.configured).toBe(false);
    expect(body.database.connected).toBe(false);
    expect(body.ready).toBe(false);
    expect(body.database.code).toBe("database_missing");
    expect(body.database.error).toBe("Set DATABASE_URL and restart the server.");
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

  test("reports a missing current migration without exposing database errors", async () => {
    const db = getDb();
    const [migration] = await db`
      SELECT version, checksum FROM schema_migrations WHERE version = ${CURRENT_SCHEMA_VERSION}
    `;
    expect(migration).toBeDefined();
    await db`DELETE FROM schema_migrations WHERE version = ${CURRENT_SCHEMA_VERSION}`;
    try {
      const res = await dispatchApi(buildRequest("GET", "/api/deploy/status"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ready: boolean;
        database: { schemaReady: boolean; code?: string; error?: string };
      };
      expect(body.ready).toBe(false);
      expect(body.database).toMatchObject({
        schemaReady: false,
        code: "schema_not_ready",
        error: "The database schema is not current. Run bun run db:migrate.",
      });
    } finally {
      const row = migration as { version: string; checksum: string | null };
      await db`
        INSERT INTO schema_migrations (version, checksum)
        VALUES (${row.version}, ${row.checksum})
        ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum
      `;
    }
  });
});
