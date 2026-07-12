/**
 * Runtime configuration from environment variables.
 * Backend uses Bun builtins only — no dotenv package; Bun loads .env automatically.
 */

export type AppConfig = {
  nodeEnv: string;
  port: number;
  /** Loopback bind address (not the machine hostname). */
  bindAddress: string;
  /** Null when DATABASE_URL is unset — server starts; console shows setup guidance. */
  databaseUrl: string | null;
  appName: string;
  /** When set, POST /api/setup requires X-Install-Token header. */
  installToken?: string;
  /** Allow server start when setup is incomplete (development escape hatch). */
  allowIncompleteSetup: boolean;
  /** Canonical public origin for issuer, callbacks, and security links. Required HTTPS in production. */
  publicOrigin?: string;
  /** Optional first-owner bootstrap from deployment configuration. */
  bootstrapOwner: BootstrapOwnerConfig;
};

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

/** True when DATABASE_URL is set to a non-empty value. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function defaultBindAddress(nodeEnv: string): string {
  // Local dev: bind loopback so http://localhost:PORT works on WSL/macOS/Linux.
  // Production: bind all interfaces for containers and reverse proxies.
  return nodeEnv === "production" ? "0.0.0.0" : "127.0.0.1";
}

/** Avoid process.env.HOST — shells often set it to the machine hostname. */
function resolveBindAddress(nodeEnv: string): string {
  const explicit = process.env.BIND_ADDRESS;
  if (explicit) return explicit;
  return defaultBindAddress(nodeEnv);
}

export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const bootstrapOwner: BootstrapOwnerConfig = {
    organizationName: process.env.Z0_BOOTSTRAP_ORG_NAME?.trim() || undefined,
    adminName: process.env.Z0_BOOTSTRAP_ADMIN_NAME?.trim() || undefined,
    adminEmail: process.env.Z0_BOOTSTRAP_ADMIN_EMAIL?.trim() || undefined,
    adminPassword: process.env.Z0_BOOTSTRAP_ADMIN_PASSWORD?.trim() || undefined,
  };
  return {
    nodeEnv,
    port: Number(process.env.PORT ?? "3000"),
    bindAddress: resolveBindAddress(nodeEnv),
    databaseUrl: process.env.DATABASE_URL?.trim() || null,
    appName: process.env.APP_NAME ?? "z0-auth",
    installToken: process.env.INSTALL_TOKEN,
    allowIncompleteSetup: process.env.ALLOW_INCOMPLETE_SETUP === "true",
    publicOrigin: process.env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, "") || undefined,
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
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error("PUBLIC_ORIGIN must be a valid absolute origin");
    }
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("PUBLIC_ORIGIN must contain only scheme, host, and optional port");
    }
    if (config.nodeEnv === "production" && url.protocol !== "https:") {
      throw new Error("PUBLIC_ORIGIN must use https in production");
    }
    return url.origin;
  }
  if (config.nodeEnv === "production") {
    throw new Error("PUBLIC_ORIGIN is required in production");
  }
  return new URL(req.url).origin;
}

/** URL shown in logs and docs (always localhost in development). */
export function serverBaseUrl(config: AppConfig): string {
  const host = config.nodeEnv === "production" ? config.bindAddress : "localhost";
  return `http://${host}:${config.port}/`;
}
