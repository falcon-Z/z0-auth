import { db } from "./db/client";
import { Logger, DatabaseErrorHandler } from "./error-handling";

let openCount = 0;

export async function ensureSuperAdminExists(serverUrl: string): Promise<void> {
  try {
    const healthCheck = await db.healthCheck();
    if (healthCheck.status === 'unhealthy') {
      Logger.error('Database unhealthy, cannot check super admin existence', {
        error: healthCheck.error
      });
      return;
    }

    const superAdminCount = await db.platformManager.count({
      where: { roleType: "SUPER_ADMIN" },
    });

    if (superAdminCount === 0) {
      const setupUrl = `${serverUrl}setup`;
      Logger.warn('No SUPER_ADMIN found, setup required', {
        setupUrl,
        serverUrl
      });

      console.warn(
        `[SETUP] No SUPER_ADMIN found. Please visit ${setupUrl} to configure super admin credentials.`
      );

      if (process.env.NODE_ENV !== "production" && openCount === 0) {
        openCount++;
        try {
          const open = await import("open");
          await open.default(setupUrl);
          Logger.info('Browser opened automatically for setup', { setupUrl });
        } catch (error) {
          Logger.warn('Could not open browser automatically', {
            error: error.message,
            setupUrl
          });
        }
      }
    } else {
      Logger.info('Super admin exists, setup not required', {
        superAdminCount
      });
    }
  } catch (error) {
    const dbError = DatabaseErrorHandler.handleError(error);
    Logger.error('Error checking SUPER_ADMIN existence', {
      error: dbError.message,
      code: dbError.code,
      retryable: dbError.isRetryable
    });

    if (dbError.isRetryable) {
      Logger.info('Retrying super admin check in 5 seconds...');
      setTimeout(async () => {
        try {
          await ensureSuperAdminExists(serverUrl);
        } catch (retryError) {
          Logger.error('Retry of super admin check failed', {
            error: retryError.message
          });
        }
      }, 5000);
    }
  }
}
