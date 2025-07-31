/**
 * Configuration state management utilities
 * Handles dynamic updates to configuration state on the client side
 */

import configFile from "../config.json";

export interface AppConfig {
  SuperAdminConfigured: boolean;
}

// Initialize with the static config
let currentConfig: AppConfig = { ...configFile };

/**
 * Get the current configuration state
 * @returns AppConfig - Current configuration
 */
export function getConfig(): AppConfig {
  return { ...currentConfig };
}

/**
 * Update the configuration state
 * @param updates - Partial configuration updates
 */
export function updateConfig(updates: Partial<AppConfig>): void {
  currentConfig = { ...currentConfig, ...updates };
}

/**
 * Check if super admin is configured
 * @returns boolean - True if super admin is configured
 */
export function isSuperAdminConfigured(): boolean {
  return currentConfig.SuperAdminConfigured;
}

/**
 * Mark super admin as configured
 */
export function markSuperAdminConfigured(): void {
  updateConfig({ SuperAdminConfigured: true });
}

/**
 * Reset configuration to initial state (useful for testing)
 */
export function resetConfig(): void {
  currentConfig = { ...configFile };
}
