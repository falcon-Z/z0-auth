/**
 * Runtime configuration from environment variables.
 * Backend uses Bun builtins only — no dotenv package; Bun loads .env automatically.
 */

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  /** Loopback bind address (not the machine hostname). */
  bindAddress: string;
  /** Null when DATABASE_URL is unset — server starts; console shows setup guidance. */
  databaseUrl: string | null;
  databasePoolMax: number;
  appName: string;
  /** When set, POST /api/setup requires X-Install-Token header. */
  installToken?: string;
  /** Allow server start when setup is incomplete (development escape hatch). */
  allowIncompleteSetup: boolean;
  /** Number of trusted reverse proxies that append X-Forwarded-For. */
  trustProxyHops: number;
  /** Development/test key file. Production still requires environment-backed keys. */
  instanceKeysPath: string;
  /** Canonical public origin for issuer, callbacks, and security links. Required HTTPS in production. */
  publicOrigin?: string;
  /** Optional first-owner bootstrap from deployment configuration. */
  bootstrapOwner: BootstrapOwnerConfig;
};

export type ConfigErrorReason = "missing" | "invalid" | "incomplete" | "unsafe";

/** An operator-safe environment error. It names variables, never their values. */
export class ConfigError extends Error {
  constructor(
    readonly variables: string[],
    readonly reason: ConfigErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

export type BootstrapOwnerConfig = {
  organizationName?: string;
  adminName?: string;
  adminEmail?: string;
  adminPassword?: string;
};

export type BootstrapOwnerField =
  | "organizationName"
  | "adminName"
  | "adminEmail"
  | "adminPassword";

const bootstrapOwnerFields = {
  organizationName: "Z0_BOOTSTRAP_ORG_NAME",
  adminName: "Z0_BOOTSTRAP_ADMIN_NAME",
  adminEmail: "Z0_BOOTSTRAP_ADMIN_EMAIL",
  adminPassword: "Z0_BOOTSTRAP_ADMIN_PASSWORD",
} as const satisfies Record<BootstrapOwnerField, string>;

function defaultBindAddress(nodeEnv: string): string {
  // Local dev: bind loopback so http://localhost:PORT works on WSL/macOS/Linux.
  // Production: bind all interfaces for containers and reverse proxies.
  return nodeEnv === "production" ? "0.0.0.0" : "127.0.0.1";
}

function optionalValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function parseNodeEnv(): AppConfig["nodeEnv"] {
  const value = process.env.NODE_ENV === undefined ? "development" : process.env.NODE_ENV.trim();
  if (value === "development" || value === "test" || value === "production") return value;
  throw new ConfigError(
    ["NODE_ENV"],
    "invalid",
    "NODE_ENV must be development, test, or production.",
  );
}

export function parseEnvironmentBoolean(name: string, defaultValue: boolean): boolean {
  if (process.env[name] === undefined) return defaultValue;
  const value = process.env[name]!.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ConfigError([name], "invalid", `${name} must be true or false.`);
}

export function parseEnvironmentInteger(
  name: string,
  defaultValue: number,
  bounds: { min: number; max: number },
): number {
  if (process.env[name] === undefined) return defaultValue;
  const value = process.env[name]!.trim();
  if (!/^\d+$/.test(value)) {
    throw new ConfigError(
      [name],
      "invalid",
      `${name} must be a whole number from ${bounds.min} to ${bounds.max}.`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    throw new ConfigError(
      [name],
      "invalid",
      `${name} must be a whole number from ${bounds.min} to ${bounds.max}.`,
    );
  }
  return parsed;
}

export function validateHostOrIp(name: string, value: string): string {
  if (
    value.length > 253 ||
    /\s/.test(value) ||
    value.includes("/") ||
    value.includes("@") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("://") ||
    !value
  ) {
    throw new ConfigError(
      [name],
      "invalid",
      `${name} must be a hostname or IP address without a scheme, path, or port.`,
    );
  }
  try {
    const parsed = value.includes(":")
      ? new URL(`http://[${value}]/`)
      : new URL(`http://${value}/`);
    if (parsed.port) throw new Error();
  } catch {
    throw new ConfigError(
      [name],
      "invalid",
      `${name} must be a hostname or IP address without a scheme, path, or port.`,
    );
  }
  return value;
}

function parseBindAddress(nodeEnv: AppConfig["nodeEnv"]): string {
  const value = process.env.BIND_ADDRESS === undefined
    ? defaultBindAddress(nodeEnv)
    : process.env.BIND_ADDRESS.trim();
  return validateHostOrIp("BIND_ADDRESS", value);
}

function parseDatabaseUrl(): string | null {
  const value = optionalValue("DATABASE_URL");
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error();
  } catch {
    throw new ConfigError(
      ["DATABASE_URL"],
      "invalid",
      "DATABASE_URL must be a valid postgres:// or postgresql:// URL.",
    );
  }
  return value;
}

function parsePublicOrigin(): string | undefined {
  const value = optionalValue("PUBLIC_ORIGIN")?.replace(/\/+$/, "");
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(
      ["PUBLIC_ORIGIN"],
      "invalid",
      "PUBLIC_ORIGIN must be a valid absolute origin.",
    );
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new ConfigError(
      ["PUBLIC_ORIGIN"],
      "invalid",
      "PUBLIC_ORIGIN must contain only http or https, a host, and an optional port.",
    );
  }
  return url.origin;
}

/** Avoid process.env.HOST — shells often set it to the machine hostname. */
export function loadConfig(): AppConfig {
  const nodeEnv = parseNodeEnv();
  const bootstrapOwner: BootstrapOwnerConfig = {
    organizationName: process.env.Z0_BOOTSTRAP_ORG_NAME?.trim() || undefined,
    adminName: process.env.Z0_BOOTSTRAP_ADMIN_NAME?.trim() || undefined,
    adminEmail: process.env.Z0_BOOTSTRAP_ADMIN_EMAIL?.trim() || undefined,
    adminPassword: process.env.Z0_BOOTSTRAP_ADMIN_PASSWORD?.trim() || undefined,
  };
  return {
    nodeEnv,
    port: parseEnvironmentInteger("PORT", 3000, { min: 1, max: 65_535 }),
    bindAddress: parseBindAddress(nodeEnv),
    databaseUrl: parseDatabaseUrl(),
    databasePoolMax: parseEnvironmentInteger("DATABASE_POOL_MAX", 10, { min: 1, max: 100 }),
    appName: process.env.APP_NAME === undefined
      ? "z0-auth"
      : (() => {
          const value = process.env.APP_NAME.trim();
          if (!value || value.length > 100) {
            throw new ConfigError(
              ["APP_NAME"],
              "invalid",
              "APP_NAME must contain 1 to 100 characters.",
            );
          }
          return value;
        })(),
    installToken: process.env.INSTALL_TOKEN === undefined
      ? undefined
      : (() => {
          const value = process.env.INSTALL_TOKEN.trim();
          if (!value) {
            throw new ConfigError(
              ["INSTALL_TOKEN"],
              "invalid",
              "INSTALL_TOKEN must not be empty when it is set.",
            );
          }
          return value;
        })(),
    allowIncompleteSetup: parseEnvironmentBoolean("ALLOW_INCOMPLETE_SETUP", false),
    trustProxyHops: parseEnvironmentInteger("TRUST_PROXY_HOPS", 0, { min: 0, max: 32 }),
    instanceKeysPath: process.env.INSTANCE_KEYS_PATH === undefined
      ? ".data/instance-keys.json"
      : (() => {
          const value = process.env.INSTANCE_KEYS_PATH.trim();
          if (!value || value.includes("\0")) {
            throw new ConfigError(
              ["INSTANCE_KEYS_PATH"],
              "invalid",
              "INSTANCE_KEYS_PATH must be a non-empty file path.",
            );
          }
          return value;
        })(),
    publicOrigin: parsePublicOrigin(),
    bootstrapOwner,
  };
}

export function bootstrapOwnerStatus(config: BootstrapOwnerConfig): {
  configured: boolean;
  ready: boolean;
  missing: BootstrapOwnerField[];
} {
  const entries = Object.keys(bootstrapOwnerFields) as BootstrapOwnerField[];
  const configured = entries.some((field) => Boolean(config[field]));
  const missing = configured ? entries.filter((field) => !config[field]) : [];
  return {
    configured,
    ready: configured && missing.length === 0,
    missing,
  };
}

/** Origin clients use to reach this instance (OIDC issuer, absolute URLs). */
export function requestPublicOrigin(req: Request): string {
  const config = loadConfig();
  const configured = config.publicOrigin;
  if (configured) {
    if (config.nodeEnv === "production" && !configured.startsWith("https://")) {
      throw new ConfigError(
        ["PUBLIC_ORIGIN"],
        "unsafe",
        "PUBLIC_ORIGIN must use https in production.",
      );
    }
    return configured;
  }
  if (config.nodeEnv === "production") {
    throw new ConfigError(
      ["PUBLIC_ORIGIN"],
      "missing",
      "PUBLIC_ORIGIN is required in production.",
    );
  }
  return new URL(req.url).origin;
}

/** URL shown in logs and docs (always localhost in development). */
export function serverBaseUrl(config: AppConfig): string {
  const host = config.nodeEnv === "production" ? config.bindAddress : "localhost";
  return `http://${host}:${config.port}/`;
}
