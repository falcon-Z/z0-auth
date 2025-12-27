/**
 * Configuration state management utilities (Frontend)
 *
 * This module manages setup completion state on the client side.
 * The server API is the source of truth, fetched once on app load.
 *
 * Architecture:
 * - Server: In-memory cache + database (source of truth)
 * - Server middleware: Blocks unauthorized access, redirects to /setup
 * - Frontend: Calls API once on load, caches in React context
 * - No file-based state (no config.json)
 *
 * Flow:
 * 1. App loads → calls GET /api/setup/status
 * 2. Stores result in memory/context
 * 3. React Router uses result for conditional routing
 * 4. Server middleware ensures no bypass possible
 */

import { getSetupStatus, type SetupStatusResponse } from "./api/setup";

export interface AppConfig {
  SuperAdminConfigured: boolean;
}

// In-memory cache for current session
let cachedStatus: SetupStatusResponse | null = null;
let lastFetch: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Fetch setup status from server
 * Cached for 1 minute to avoid excessive API calls
 */
export async function fetchSetupStatus(): Promise<SetupStatusResponse> {
  const now = Date.now();

  // Return cached value if still valid
  if (cachedStatus && now - lastFetch < CACHE_TTL) {
    return cachedStatus;
  }

  try {
    const status = await getSetupStatus();
    cachedStatus = status;
    lastFetch = now;
    return status;
  } catch (error) {
    console.error("Failed to fetch setup status:", error);
    // On error, assume setup is required (safe default)
    // This prevents access if API is down
    return {
      setupComplete: false,
      requiresSetup: true,
    };
  }
}

/**
 * Check if super admin is configured
 * Async version - fetches from server
 */
export async function checkSetupStatus(): Promise<boolean> {
  const status = await fetchSetupStatus();
  return status.setupComplete;
}

/**
 * Get setup status synchronously from cache
 * Returns null if not yet fetched
 * Use this in React components after initial fetch
 */
export function getSetupStatusSync(): SetupStatusResponse | null {
  return cachedStatus;
}

/**
 * Check if super admin is configured (synchronous)
 * Returns false if not yet fetched (safe default)
 * Use this in React components after initial fetch
 */
export function isSuperAdminConfigured(): boolean {
  return cachedStatus?.setupComplete ?? false;
}

/**
 * Mark setup as complete in cache
 * Called after successful setup completion
 */
export function markSuperAdminConfigured(): void {
  cachedStatus = {
    setupComplete: true,
    requiresSetup: false,
    lastChecked: new Date().toISOString(),
    superAdminCount: 1,
  };
  lastFetch = Date.now();
}

/**
 * Clear cached status
 * Forces next call to fetch from server
 */
export function clearCache(): void {
  cachedStatus = null;
  lastFetch = 0;
}

/**
 * Legacy compatibility functions
 * These maintain backward compatibility with existing code
 */

export function getConfig(): AppConfig {
  return {
    SuperAdminConfigured: cachedStatus?.setupComplete ?? false,
  };
}

export function updateConfig(updates: Partial<AppConfig>): void {
  if (updates.SuperAdminConfigured !== undefined) {
    if (updates.SuperAdminConfigured) {
      markSuperAdminConfigured();
    } else {
      clearCache();
    }
  }
}

export function resetConfig(): void {
  clearCache();
}
