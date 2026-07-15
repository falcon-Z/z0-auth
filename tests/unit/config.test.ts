import { afterEach, describe, expect, test } from "bun:test";

import {
  ConfigError,
  loadConfig,
  requestPublicOrigin,
} from "../../src/api/lib/config";
import { checkRuntimeConfiguration } from "../../src/api/lib/runtime-config";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe("public origin", () => {
  test("development falls back to the request origin", () => {
    process.env.NODE_ENV = "development";
    delete process.env.PUBLIC_ORIGIN;
    expect(requestPublicOrigin(new Request("http://localhost:3000/path"))).toBe("http://localhost:3000");
  });

  test("production requires one configured HTTPS origin", () => {
    process.env.NODE_ENV = "production";
    delete process.env.PUBLIC_ORIGIN;
    expect(() => requestPublicOrigin(new Request("https://attacker.example/path"))).toThrow(
      "PUBLIC_ORIGIN is required",
    );

    process.env.PUBLIC_ORIGIN = "http://auth.example.com";
    expect(() => requestPublicOrigin(new Request("https://attacker.example/path"))).toThrow("must use https");

    process.env.PUBLIC_ORIGIN = "https://auth.example.com";
    expect(requestPublicOrigin(new Request("https://attacker.example/path"))).toBe("https://auth.example.com");
  });
});

describe("server environment settings", () => {
  test("uses documented defaults", () => {
    delete process.env.PORT;
    delete process.env.BIND_ADDRESS;
    delete process.env.DATABASE_POOL_MAX;
    delete process.env.TRUST_PROXY_HOPS;
    delete process.env.ALLOW_INCOMPLETE_SETUP;
    delete process.env.INSTANCE_KEYS_PATH;
    process.env.NODE_ENV = "development";

    const config = loadConfig();
    expect(config.port).toBe(3000);
    expect(config.bindAddress).toBe("127.0.0.1");
    expect(config.databasePoolMax).toBe(10);
    expect(config.trustProxyHops).toBe(0);
    expect(config.allowIncompleteSetup).toBe(false);
    expect(config.instanceKeysPath).toBe(".data/instance-keys.json");
  });

  test.each([
    ["PORT", "3000x"],
    ["PORT", ""],
    ["PORT", "65536"],
    ["DATABASE_POOL_MAX", "10x"],
    ["DATABASE_POOL_MAX", "0"],
    ["TRUST_PROXY_HOPS", "-1"],
    ["TRUST_PROXY_HOPS", "2x"],
    ["ALLOW_INCOMPLETE_SETUP", "yes"],
    ["INSTANCE_KEYS_PATH", ""],
    ["INSTALL_TOKEN", ""],
  ])("rejects invalid %s=%s", (name, value) => {
    process.env[name] = value;
    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow(name);
  });

  test("accepts numeric boundaries", () => {
    process.env.PORT = "65535";
    process.env.DATABASE_POOL_MAX = "100";
    process.env.TRUST_PROXY_HOPS = "32";
    const config = loadConfig();
    expect(config.port).toBe(65_535);
    expect(config.databasePoolMax).toBe(100);
    expect(config.trustProxyHops).toBe(32);
  });

  test("rejects a bind address with a port or scheme", () => {
    process.env.BIND_ADDRESS = "localhost:3000";
    expect(() => loadConfig()).toThrow("BIND_ADDRESS");
    process.env.BIND_ADDRESS = "http://localhost";
    expect(() => loadConfig()).toThrow("BIND_ADDRESS");
  });

  test("accepts hostnames, IPv4, and IPv6 bind addresses", () => {
    for (const value of ["localhost", "0.0.0.0", "::1"]) {
      process.env.BIND_ADDRESS = value;
      expect(loadConfig().bindAddress).toBe(value);
    }
  });

  test("rejects unsupported node environments and database URL schemes", () => {
    process.env.NODE_ENV = "prod";
    expect(() => loadConfig()).toThrow("NODE_ENV");
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "mysql://localhost/z0auth";
    expect(() => loadConfig()).toThrow("DATABASE_URL");
  });
});

describe("full startup configuration", () => {
  test("reports safe details for incomplete SMTP settings", () => {
    process.env.NODE_ENV = "test";
    process.env.SMTP_HOST = "smtp.example.com";
    delete process.env.SMTP_FROM_ADDRESS;
    const result = checkRuntimeConfiguration();
    expect(result.ready).toBe(false);
    expect(result.issues[0]).toEqual({
      code: "config_incomplete",
      variables: ["SMTP_HOST", "SMTP_FROM_ADDRESS"],
      message: "SMTP environment settings require SMTP_HOST and SMTP_FROM_ADDRESS.",
    });
  });

  test("explicit SMTP enablement requires complete settings", () => {
    process.env.NODE_ENV = "test";
    process.env.SMTP_ENABLED = "true";
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM_ADDRESS;
    expect(checkRuntimeConfiguration().ready).toBe(false);
  });

  test("explicit SMTP disablement is valid by itself", () => {
    process.env.NODE_ENV = "test";
    process.env.SMTP_ENABLED = "false";
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM_ADDRESS;
    const result = checkRuntimeConfiguration();
    expect(result.ready).toBe(true);
    if (result.ready) expect(result.value.smtpMode).toBe("disabled");
  });

});
