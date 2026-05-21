/**
 * Runtime configuration from environment variables.
 * Backend uses Bun builtins only — no dotenv package; Bun loads .env automatically.
 */

export type AppConfig = {
  nodeEnv: string;
  port: number;
  /** Loopback bind address (not the machine hostname). */
  bindAddress: string;
  databaseUrl: string;
  appName: string;
};

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  return {
    nodeEnv,
    port: Number(process.env.PORT ?? "3000"),
    bindAddress: resolveBindAddress(nodeEnv),
    databaseUrl: requireEnv("DATABASE_URL"),
    appName: process.env.APP_NAME ?? "z0-auth",
  };
}

/** URL shown in logs and docs (always localhost in development). */
export function serverBaseUrl(config: AppConfig): string {
  const host = config.nodeEnv === "production" ? config.bindAddress : "localhost";
  return `http://${host}:${config.port}/`;
}
