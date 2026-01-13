/**
 * Server-side setup state management
 *
 * This module manages the setup completion state in memory.
 * The database is the source of truth, checked once at startup.
 * State is cached in memory for the lifetime of the server process.
 *
 * Benefits:
 * - No file I/O after startup
 * - Single source of truth (database)
 * - Fast checks (in-memory)
 * - No race conditions
 * - Works in containers/serverless
 */

import { db } from "./db/client";
import { Logger, DatabaseErrorHandler } from "./error-handling";

interface SetupState {
  isComplete: boolean;
  lastChecked: Date;
  superAdminCount: number;
}

// In-memory state (per server instance)
let setupState: SetupState | null = null;

/**
 * Check if super admin exists in database
 * This is the source of truth
 */
async function checkDatabaseForSuperAdmin(): Promise<{
  exists: boolean;
  count: number;
}> {
  try {
    const count = await db.platformMembership.count({
      where: { roleType: "SUPER_ADMIN" },
    });

    return { exists: count > 0, count };
  } catch (error) {
    const dbError = DatabaseErrorHandler.handleError(error);
    Logger.error("Error checking SUPER_ADMIN existence", {
      error: dbError.message,
      code: dbError.code,
      retryable: dbError.isRetryable,
    });
    throw error;
  }
}

/**
 * Initialize setup state on server startup
 * Should be called once during bootstrap
 */
export async function initializeSetupState(): Promise<void> {
  try {
    // Check database health first
    const healthCheck = await db.healthCheck();
    if (healthCheck.status === "unhealthy") {
      Logger.error("Database unhealthy during setup state initialization", {
        error: healthCheck.error,
      });
      // Default to requiring setup if DB is down (safe default)
      setupState = {
        isComplete: false,
        lastChecked: new Date(),
        superAdminCount: 0,
      };
      return;
    }

    // Query database for super admin
    const { exists, count } = await checkDatabaseForSuperAdmin();

    setupState = {
      isComplete: exists,
      lastChecked: new Date(),
      superAdminCount: count,
    };

    if (!exists) {
      Logger.warn(
        "No SUPER_ADMIN found, setup required. Only one SUPER_ADMIN should exist.",
        { superAdminCount: count }
      );
    } else if (count > 1) {
      Logger.warn(
        "More than one SUPER_ADMIN found, this violates system constraints",
        { superAdminCount: count }
      );
    } else {
      Logger.info("Super admin exists, setup complete", {
        superAdminCount: count,
      });
    }
  } catch (error) {
    Logger.error("Failed to initialize setup state", {
      error: error.message,
    });
    // Default to requiring setup on error (safe default)
    setupState = {
      isComplete: false,
      lastChecked: new Date(),
      superAdminCount: 0,
    };
  }
}

/**
 * Check if setup is complete
 * Returns cached state for performance
 */
export function isSetupComplete(): boolean {
  if (!setupState) {
    Logger.warn(
      "Setup state not initialized, defaulting to incomplete (safe default)"
    );
    return false;
  }
  return setupState.isComplete;
}

/**
 * Get current setup state
 */
export function getSetupState(): SetupState | null {
  return setupState ? { ...setupState } : null;
}

/**
 * Mark setup as complete
 * Called after successful super admin creation
 */
export function markSetupComplete(): void {
  if (!setupState) {
    setupState = {
      isComplete: true,
      lastChecked: new Date(),
      superAdminCount: 1,
    };
  } else {
    setupState.isComplete = true;
    setupState.superAdminCount = 1;
    setupState.lastChecked = new Date();
  }
  Logger.info("Setup marked as complete in memory");
}

/**
 * Refresh setup state from database
 * Useful for development or when state might have changed
 */
export async function refreshSetupState(): Promise<void> {
  Logger.info("Refreshing setup state from database");
  await initializeSetupState();
}

/**
 * Reset setup state (for testing/development)
 */
export function resetSetupState(): void {
  setupState = null;
  Logger.warn("Setup state has been reset");
}
