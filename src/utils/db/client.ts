import { PrismaClient } from "generated/prisma";
import { Logger, DatabaseErrorHandler } from "../error-handling";

/**
 * Enhanced Prisma client with connection error handling
 */
class EnhancedPrismaClient extends PrismaClient {
  constructor() {
    super({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
      errorFormat: 'pretty',
    });

    this.$on('error', (e) => {
      Logger.error('Database error event', {
        target: e.target,
        message: e.message,
        timestamp: e.timestamp
      });
    });

    this.$on('warn', (e) => {
      Logger.warn('Database warning event', {
        target: e.target,
        message: e.message,
        timestamp: e.timestamp
      });
    });
  }

  /**
   * Enhanced connection method with retry logic
   */
  async connectWithRetry(maxRetries: number = 3, retryDelay: number = 1000): Promise<void> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();
        Logger.info(`Database connected successfully on attempt ${attempt}`);
        return;
      } catch (error) {
        lastError = error;
        const dbError = DatabaseErrorHandler.handleError(error);
        
        Logger.warn(`Database connection attempt ${attempt} failed`, {
          attempt,
          maxRetries,
          error: dbError.message,
          code: dbError.code,
          retryable: dbError.isRetryable
        });

        if (!dbError.isRetryable) {
          throw error;
        }

        if (attempt < maxRetries) {
          Logger.info(`Retrying database connection in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay *= 2; // Exponential backoff
        }
      }
    }

    const dbError = DatabaseErrorHandler.handleError(lastError);
    Logger.error('Database connection failed after all retry attempts', {
      maxRetries,
      finalError: dbError.message,
      code: dbError.code
    });
    throw lastError;
  }

  /**
   * Enhanced disconnect with proper cleanup
   */
  async disconnectSafely(): Promise<void> {
    try {
      await this.$disconnect();
      Logger.info('Database disconnected successfully');
    } catch (error) {
      Logger.error('Error during database disconnect', { error: error.message });
      throw error;
    }
  }

  /**
   * Health check method
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      await this.$queryRaw`SELECT 1`;
      const latency = Date.now() - startTime;
      
      Logger.debug('Database health check passed', { latency });
      return { status: 'healthy', latency };
    } catch (error) {
      const dbError = DatabaseErrorHandler.handleError(error);
      Logger.error('Database health check failed', {
        error: dbError.message,
        code: dbError.code
      });
      
      return { 
        status: 'unhealthy', 
        error: dbError.message 
      };
    }
  }
}

export const db = new EnhancedPrismaClient();
