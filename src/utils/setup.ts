import { db } from "./db/client";
import { Logger, DatabaseErrorHandler } from "./error-handling";

let openCount = 0;

async function updateConfigFile(configured: boolean): Promise<void> {
  try {
    const fs = await import("fs/promises");
    const configPath = new URL("../config.json", import.meta.url).pathname;
    await fs.writeFile(
      configPath,
      JSON.stringify({ SuperAdminConfigured: configured }, null, 2),
      "utf-8"
    );
    Logger.info("Config file updated", { SuperAdminConfigured: configured });
  } catch (error) {
    Logger.error("Failed to update config file", { error: error.message });
  }
}

export async function ensureSuperAdminExists(serverUrl: string): Promise<void> {
  try {
    const healthCheck = await db.healthCheck();
    if (healthCheck.status === "unhealthy") {
      Logger.error("Database unhealthy, cannot check super admin existence", {
        error: healthCheck.error,
      });
      return;
    }

    const superAdminCount = await db.platformManager.count({
      where: { roleType: "SUPER_ADMIN" },
    });

    if (superAdminCount === 0) {
      await updateConfigFile(false);
      const setupUrl = `${serverUrl}setup`;
      Logger.warn(
        "No SUPER_ADMIN found, setup required. Only one SUPER_ADMIN should exist.",
        {
          setupUrl,
          serverUrl,
        }
      );

      console.warn(
        `[SETUP] No SUPER_ADMIN found. Please visit ${setupUrl} to configure super admin credentials.`
      );

      if (process.env.NODE_ENV !== "production" && openCount === 0) {
        openCount++;
        try {
          const open = await import("open");
          await open.default(setupUrl);
          Logger.info("Browser opened automatically for setup", { setupUrl });
        } catch (error) {
          Logger.warn("Could not open browser automatically", {
            error: error.message,
            setupUrl,
          });
        }
      }
    } else if (superAdminCount > 1) {
      await updateConfigFile(true);
      Logger.warn(
        "More than one SUPER_ADMIN found, this violates system constraints",
        {
          superAdminCount,
        }
      );
    } else {
      await updateConfigFile(true);
      Logger.info("Super admin exists, setup not required", {
        superAdminCount,
      });
    }
  } catch (error) {
    const dbError = DatabaseErrorHandler.handleError(error);
    Logger.error("Error checking SUPER_ADMIN existence", {
      error: dbError.message,
      code: dbError.code,
      retryable: dbError.isRetryable,
    });

    if (dbError.isRetryable) {
      Logger.info("Retrying super admin check in 5 seconds...");
      setTimeout(async () => {
        try {
          await ensureSuperAdminExists(serverUrl);
        } catch (retryError) {
          Logger.error("Retry of super admin check failed", {
            error: retryError.message,
          });
        }
      }, 5000);
    }
  }
}
