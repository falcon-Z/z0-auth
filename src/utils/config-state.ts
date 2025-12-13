/**
 * Configuration state management utilities
 * Handles dynamic updates to configuration state on the client side
 *
 * Priority: config.json (server-updated) > localStorage (session persistence)
 * The server updates config.json on startup based on database state,
 * so it's the source of truth. localStorage is only used for in-session
 * persistence after setup completes.
 */

import configFile from "../config.json";

export interface AppConfig {
  SuperAdminConfigured: boolean;
}

const CONFIG_STORAGE_KEY = "z0_config_state";

function getPersistedConfig(): Partial<AppConfig> {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

function persistConfig(config: AppConfig): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage errors
  }
}

function initializeConfig(): AppConfig {
  const persisted = getPersistedConfig();

  if (configFile.SuperAdminConfigured) {
    return { ...configFile };
  }

  if (!configFile.SuperAdminConfigured && persisted.SuperAdminConfigured) {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem(CONFIG_STORAGE_KEY);
    }
    return { ...configFile };
  }

  return {
    ...configFile,
    ...persisted,
  };
}

let currentConfig: AppConfig = initializeConfig();

export function getConfig(): AppConfig {
  return { ...currentConfig };
}

export function updateConfig(updates: Partial<AppConfig>): void {
  currentConfig = { ...currentConfig, ...updates };
  persistConfig(currentConfig);
}

export function isSuperAdminConfigured(): boolean {
  return currentConfig.SuperAdminConfigured;
}

export function markSuperAdminConfigured(): void {
  updateConfig({ SuperAdminConfigured: true });
}

export function resetConfig(): void {
  currentConfig = { ...configFile };
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
  }
}
