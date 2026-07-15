import { afterEach, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import path from "node:path";

const running: Bun.Subprocess[] = [];
const keyFiles: string[] = [];

afterEach(async () => {
  for (const process of running.splice(0)) {
    process.kill("SIGTERM");
    await process.exited;
  }
  for (const file of keyFiles.splice(0)) {
    try {
      await unlink(file);
    } catch {
      // The invalid-setting test exits before a key file is created.
    }
  }
});

function cleanChildEnvironment(): Record<string, string> {
  const environment = { ...process.env } as Record<string, string>;
  for (const name of [
    "PUBLIC_ORIGIN",
    "SMTP_ENABLED",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_ENCRYPTION",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "SMTP_FROM_ADDRESS",
    "SMTP_FROM_NAME",
    "INSTANCE_DATA_KEY_ID",
    "INSTANCE_DATA_KEY",
    "INSTANCE_TOKEN_KEY_ID",
    "INSTANCE_TOKEN_PRIVATE_KEY",
    "INSTANCE_TOKEN_PUBLIC_KEY",
    "Z0_BOOTSTRAP_ORG_NAME",
    "Z0_BOOTSTRAP_ADMIN_NAME",
    "Z0_BOOTSTRAP_ADMIN_EMAIL",
    "Z0_BOOTSTRAP_ADMIN_PASSWORD",
  ]) {
    delete environment[name];
  }
  environment.NODE_ENV = "test";
  return environment;
}

async function waitForHttp(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await Bun.sleep(50);
    }
  }
  throw lastError;
}

describe("server startup and readiness", () => {
  test("invalid settings exit before listening and do not print secret values", async () => {
    const environment = cleanChildEnvironment();
    environment.PORT = "3000x";
    environment.SMTP_PASSWORD = "must-not-appear";
    const child = Bun.spawn([process.execPath, "src/server.ts"], {
      cwd: path.join(import.meta.dir, "../.."),
      env: environment,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await child.exited;
    const output = `${await new Response(child.stdout).text()}${await new Response(child.stderr).text()}`;
    expect(exitCode).not.toBe(0);
    expect(output).toContain("Startup failed: PORT");
    expect(output).not.toContain("must-not-appear");
  });

  test("a database outage leaves direct startup live but not ready", async () => {
    const reserved = Bun.serve({ port: 0, fetch: () => new Response("reserved") });
    const port = reserved.port;
    await reserved.stop(true);

    const environment = cleanChildEnvironment();
    const keyFile = path.join(import.meta.dir, `../.data/startup-${crypto.randomUUID()}.json`);
    keyFiles.push(keyFile);
    environment.PORT = String(port);
    environment.BIND_ADDRESS = "127.0.0.1";
    environment.DATABASE_URL = "postgresql://postgres:unused@127.0.0.1:1/z0auth_test";
    environment.DATABASE_POOL_MAX = "1";
    environment.INSTANCE_KEYS_PATH = keyFile;

    const child = Bun.spawn([process.execPath, "src/server.ts"], {
      cwd: path.join(import.meta.dir, "../.."),
      env: environment,
      stdout: "pipe",
      stderr: "pipe",
    });
    running.push(child);

    const live = await waitForHttp(`http://127.0.0.1:${port}/api/live`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "alive" });

    const ready = await fetch(`http://127.0.0.1:${port}/api/ready`);
    expect(ready.status).toBe(503);
    const body = (await ready.json()) as {
      status: string;
      checks: { database: { code?: string }; configuration: { ready: boolean } };
    };
    expect(body.status).toBe("not_ready");
    expect(body.checks.database.code).toBe("database_unavailable");
    expect(body.checks.configuration.ready).toBe(true);
  });
});
