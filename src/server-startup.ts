import { logger } from './lib/logger';
import { ensureDatabaseReady, type DatabaseStartupResult } from '../database/runtime';

export interface StartupLogger {
  info(message: string, context?: Record<string, unknown>): void;
}

export interface ServerStartupDependencies {
  ensureDatabaseReady?: () => Promise<DatabaseStartupResult>;
  logger?: StartupLogger;
}

export async function ensureServerStartupReadiness(
  dependencies: ServerStartupDependencies = {}
): Promise<DatabaseStartupResult> {
  const readinessCheck = dependencies.ensureDatabaseReady ?? ensureDatabaseReady;
  const startupLogger = dependencies.logger ?? logger;

  startupLogger.info('Checking database connectivity and migrations before server start');

  const result = await readinessCheck();

  startupLogger.info('Database ready', {
    appliedMigrations: result.appliedMigrations,
    totalMigrations: result.totalMigrations,
  });

  return result;
}
