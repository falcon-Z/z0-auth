import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Repo root `.env` (monolith runs from repo root or `src/`). */
const ROOT_ENV = path.join(import.meta.dir, "..", "..", ".env");

/** Load a `.env` file without overriding existing process.env entries. */
export function loadEnvFile(envPath: string): void {
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * Load root `.env` when variables are not already set (e.g. CI exports DATABASE_URL).
 * Bun only auto-loads `.env` from cwd; this loads the repo root file when needed.
 */
export function loadRootEnv(): void {
  loadEnvFile(ROOT_ENV);
}
