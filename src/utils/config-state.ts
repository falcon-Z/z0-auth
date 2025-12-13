/**
 * Configuration state management utilities
 * Handles dynamic updates to configuration state on the client side
 * Uses localStorage for persistence to survive page navigations
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

let currentConfig: AppConfig = {
  ...configFile,
  ...getPersistedConfig(),
};

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
