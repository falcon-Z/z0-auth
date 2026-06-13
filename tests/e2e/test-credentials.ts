import { loadRootEnv } from "../../src/lib/load-root-env";

loadRootEnv();

/** Console login password in e2e — set DEV_SEED_PASSWORD or E2E_PASSWORD in `.env`. */
export function e2ePassword(): string | undefined {
  return process.env.DEV_SEED_PASSWORD?.trim() || process.env.E2E_PASSWORD?.trim();
}

export function requireE2ePassword(): string {
  const password = e2ePassword();
  if (!password) {
    throw new Error("Set DEV_SEED_PASSWORD (or E2E_PASSWORD) in .env for Playwright tests.");
  }
  return password;
}
