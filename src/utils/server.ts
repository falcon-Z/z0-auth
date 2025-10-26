import { server } from "@z0/server";
import { db } from "./db/client";
import { ensureSuperAdminExists } from "./setup";
import { ensureJWTKeypair } from "./auth";
import { Logger, DatabaseErrorHandler } from "./error-handling";

const env = process.env.NODE_ENV || "Development";

export async function connectDB(): Promise<boolean> {
  try {
    await db.connectWithRetry(3, 1000);
    Logger.info('Database connection established successfully');
    
    const healthCheck = await db.healthCheck();
    if (healthCheck.status === 'healthy') {
      Logger.info('Database health check passed', { latency: healthCheck.latency });
      return true;
    } else {
      Logger.error('Database health check failed', { error: healthCheck.error });
      return false;
    }
  } catch (err) {
    const dbError = DatabaseErrorHandler.handleError(err);
    Logger.error('Database connection failed during startup', {
      error: dbError.message,
      code: dbError.code,
      retryable: dbError.isRetryable
    });
    
    if (process.env.NODE_ENV === 'production' && !dbError.isRetryable) {
      Logger.error('Critical database error in production, exiting process');
      process.exit(1);
    }
    
    return false;
  }
}

export async function postStartupChecks() {
  Logger.info(`Application starting in ${env} environment`);
  
  const dbConnected = await connectDB();
  
  if (!dbConnected) {
    Logger.warn('Database connection failed, some features may not work properly');
  }
  
  try {
    await ensureJWTKeypair();
    Logger.info('JWT keypair verification completed');
  } catch (error) {
    Logger.error('JWT keypair setup failed', { error: error.message });
    if (process.env.NODE_ENV === 'production') {
      Logger.error('Critical JWT setup error in production, exiting process');
      process.exit(1);
    }
  }
  
  Logger.info(`🚀 Server running at ${server.url}`);
  
  if (dbConnected) {
    try {
      await ensureSuperAdminExists(server.url.toString());
    } catch (error) {
      Logger.error('Super admin check failed', { error: error.message });
    }
  } else {
    Logger.warn('Skipping super admin check due to database connection issues');
  }
}

/**
 * Graceful shutdown handler
 */
export async function gracefulShutdown(signal: string) {
  Logger.info(`Received ${signal}, starting graceful shutdown`);
  
  try {
    await db.disconnectSafely();
    Logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    Logger.error('Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
