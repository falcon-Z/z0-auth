import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";

import { closeDatabase, getDb } from "../../src/api/lib/db";
import { runConfiguredBootstrap } from "../../src/api/setup/bootstrap";
import { hasTestDatabase, resetTestDatabase } from "../helpers/db";
import { makeStrongPassword } from "../helpers/password";

const run = hasTestDatabase() ? describe : describe.skip;

const envKeys = [
  "Z0_BOOTSTRAP_ORG_NAME",
  "Z0_BOOTSTRAP_ADMIN_NAME",
  "Z0_BOOTSTRAP_ADMIN_EMAIL",
  "Z0_BOOTSTRAP_ADMIN_PASSWORD",
] as const;

const savedEnv: Record<(typeof envKeys)[number], string | undefined> = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof envKeys)[number], string | undefined>;

function restoreEnv() {
  for (const key of envKeys) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

run("configured bootstrap", () => {
  beforeEach(async () => {
    restoreEnv();
    await resetTestDatabase();
  });

  afterEach(() => {
    restoreEnv();
  });

  test("skips when no bootstrap owner configuration is present", async () => {
    const result = await runConfiguredBootstrap();
    expect(result.status).toBe("not-configured");
  });

  test("reports missing required bootstrap owner fields", async () => {
    process.env.Z0_BOOTSTRAP_ADMIN_EMAIL = "owner@example.com";

    const result = await runConfiguredBootstrap();
    expect(result).toEqual({
      status: "incomplete",
      missing: ["organizationName", "adminName", "adminPassword"],
    });
  });

  test("creates the first owner from complete bootstrap owner configuration", async () => {
    process.env.Z0_BOOTSTRAP_ORG_NAME = "Acme IAM";
    process.env.Z0_BOOTSTRAP_ADMIN_NAME = "Owner User";
    process.env.Z0_BOOTSTRAP_ADMIN_EMAIL = "owner@example.com";
    process.env.Z0_BOOTSTRAP_ADMIN_PASSWORD = makeStrongPassword();

    const result = await runConfiguredBootstrap();
    expect(result).toEqual({ status: "created" });

    const db = getDb();
    const [settings] = await db`
      SELECT organization_name, setup_completed_at
      FROM instance_settings
      WHERE id = 1
    `;
    expect((settings as { organization_name: string }).organization_name).toBe("Acme IAM");
    expect((settings as { setup_completed_at: Date | null }).setup_completed_at).toBeTruthy();

    const [member] = await db`
      SELECT u.email, m.is_bootstrap
      FROM users u
      JOIN instance_members m ON m.user_id = u.id
      WHERE u.email = 'owner@example.com'
    `;
    expect((member as { email: string }).email).toBe("owner@example.com");
    expect((member as { is_bootstrap: boolean }).is_bootstrap).toBe(true);

    delete process.env.Z0_BOOTSTRAP_ORG_NAME;
    delete process.env.Z0_BOOTSTRAP_ADMIN_NAME;
    process.env.Z0_BOOTSTRAP_ADMIN_PASSWORD = "weak";
    expect(await runConfiguredBootstrap()).toEqual({ status: "already-complete" });
  });
});

afterAll(async () => {
  await closeDatabase();
});
