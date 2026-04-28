/**
 * Z0 Auth - Logging Utility
 * 
 * Simple, structured logging for the Z0 auth service.
 * Supports different log levels and includes request context.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private minLevel: LogLevel;
  private levels = { debug: 0, info: 1, warn: 2, error: 3 };

  constructor(minLevel: LogLevel = 'info') {
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel];
  }

  private format(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error, requestId?: string) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(requestId && { requestId }),
      ...(context && { context }),
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }),
    };

    const formatted = this.format(entry);

    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  debug(message: string, context?: Record<string, unknown>, requestId?: string) {
    this.log('debug', message, context, undefined, requestId);
  }

  info(message: string, context?: Record<string, unknown>, requestId?: string) {
    this.log('info', message, context, undefined, requestId);
  }

  warn(message: string, context?: Record<string, unknown>, requestId?: string) {
    this.log('warn', message, context, undefined, requestId);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>, requestId?: string) {
    this.log('error', message, context, error, requestId);
  }

  setLevel(level: LogLevel) {
    this.minLevel = level;
  }
}

export const logger = new Logger(process.env.LOG_LEVEL as LogLevel || 'info');
