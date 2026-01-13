/**
 * Enhanced error handling utilities for server-side operations
 * Provides structured error responses, logging, and database error handling
 */

import type { Context } from "hono";

export enum ErrorType {
  VALIDATION = "VALIDATION",
  DATABASE = "DATABASE",
  AUTHENTICATION = "AUTHENTICATION",
  AUTHORIZATION = "AUTHORIZATION",
  SECURITY = "SECURITY",
  SYSTEM = "SYSTEM",
  NETWORK = "NETWORK",
}

export interface ErrorResponse {
  error: string;
  type: ErrorType;
  code: string;
  details?: any;
  timestamp: string;
  requestId?: string;
}

export interface FieldError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationErrorResponse extends ErrorResponse {
  fieldErrors: FieldError[];
}

/**
 * Logger utility for structured logging
 */
export class Logger {
  private static formatLogEntry(
    level: string,
    message: string,
    meta?: any
  ): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(meta && { meta }),
    };
    return JSON.stringify(logEntry);
  }

  static info(message: string, meta?: any): void {
    console.log(this.formatLogEntry("INFO", message, meta));
  }

  static warn(message: string, meta?: any): void {
    console.warn(this.formatLogEntry("WARN", message, meta));
  }

  static error(message: string, meta?: any): void {
    console.error(this.formatLogEntry("ERROR", message, meta));
  }

  static security(message: string, meta?: any): void {
    console.warn(this.formatLogEntry("SECURITY", message, meta));
  }

  static debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV !== "production") {
      console.debug(this.formatLogEntry("DEBUG", message, meta));
    }
  }
}

/**
 * Database error handler with specific error categorization
 */
export class DatabaseErrorHandler {
  static handleError(error: any): {
    message: string;
    code: string;
    isRetryable: boolean;
  } {
    if (error.code) {
      switch (error.code) {
        case "P1001":
          return {
            message: "Database server is not reachable",
            code: "DB_CONNECTION_FAILED",
            isRetryable: true,
          };
        case "P1002":
          return {
            message: "Database connection timed out",
            code: "DB_CONNECTION_TIMEOUT",
            isRetryable: true,
          };
        case "P1003":
          return {
            message: "Database does not exist",
            code: "DB_NOT_FOUND",
            isRetryable: false,
          };
        case "P1008":
          return {
            message: "Database operation timed out",
            code: "DB_OPERATION_TIMEOUT",
            isRetryable: true,
          };
        case "P1017":
          return {
            message: "Database connection lost",
            code: "DB_CONNECTION_LOST",
            isRetryable: true,
          };
        case "P2002":
          return {
            message: "A record with this information already exists",
            code: "DB_UNIQUE_CONSTRAINT",
            isRetryable: false,
          };
        case "P2025":
          return {
            message: "Record not found",
            code: "DB_RECORD_NOT_FOUND",
            isRetryable: false,
          };
        default:
          Logger.error("Unhandled Prisma error", {
            code: error.code,
            message: error.message,
          });
          return {
            message: "Database operation failed",
            code: "DB_OPERATION_FAILED",
            isRetryable: false,
          };
      }
    }

    if (error.message?.includes("connection")) {
      return {
        message: "Database connection error",
        code: "DB_CONNECTION_ERROR",
        isRetryable: true,
      };
    }

    if (error.message?.includes("timeout")) {
      return {
        message: "Database operation timed out",
        code: "DB_TIMEOUT",
        isRetryable: true,
      };
    }

    Logger.error("Unknown database error", {
      error: error.message,
      stack: error.stack,
    });
    return {
      message: "Database operation failed",
      code: "DB_UNKNOWN_ERROR",
      isRetryable: false,
    };
  }
}

/**
 * Error response builder for consistent API responses
 */
export class ErrorResponseBuilder {
  static validation(
    message: string,
    fieldErrors: FieldError[] = [],
    details?: any
  ): ValidationErrorResponse {
    return {
      error: message,
      type: ErrorType.VALIDATION,
      code: "VALIDATION_FAILED",
      fieldErrors,
      details,
      timestamp: new Date().toISOString(),
    };
  }

  static database(
    message: string,
    code: string,
    isRetryable: boolean = false
  ): ErrorResponse {
    return {
      error: message,
      type: ErrorType.DATABASE,
      code,
      details: { retryable: isRetryable },
      timestamp: new Date().toISOString(),
    };
  }

  static security(message: string, code: string, details?: any): ErrorResponse {
    return {
      error: message,
      type: ErrorType.SECURITY,
      code,
      details,
      timestamp: new Date().toISOString(),
    };
  }

  static system(message: string, code: string, details?: any): ErrorResponse {
    return {
      error: message,
      type: ErrorType.SYSTEM,
      code,
      details,
      timestamp: new Date().toISOString(),
    };
  }

  static authentication(message: string, code: string): ErrorResponse {
    return {
      error: message,
      type: ErrorType.AUTHENTICATION,
      code,
      timestamp: new Date().toISOString(),
    };
  }

  static authorization(message: string, details?: any): ErrorResponse {
    return {
      error: message,
      type: ErrorType.AUTHORIZATION,
      code: "AUTHORIZATION_FAILED",
      details,
      timestamp: new Date().toISOString(),
    };
  }

  static notFound(message: string, code: string = "RESOURCE_NOT_FOUND"): ErrorResponse {
    return {
      error: message,
      type: ErrorType.VALIDATION, // or a new type NOT_FOUND
      code,
      timestamp: new Date().toISOString(),
    };
  }

  static conflict(message: string, code: string = "RESOURCE_CONFLICT"): ErrorResponse {
    return {
      error: message,
      type: ErrorType.VALIDATION,
      code,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Security event logger for monitoring suspicious activities
 */
export class SecurityLogger {
  static logSuspiciousActivity(
    activity: string,
    context: Context,
    details?: any
  ): void {
    const clientIP =
      context.req.header("x-forwarded-for") ||
      context.req.header("x-real-ip") ||
      "unknown";
    const userAgent = context.req.header("user-agent") || "unknown";
    const origin = context.req.header("origin") || "unknown";

    Logger.security(`Suspicious activity detected: ${activity}`, {
      clientIP,
      userAgent,
      origin,
      url: context.req.url,
      method: context.req.method,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  static logSetupAttempt(
    context: Context,
    success: boolean,
    details?: any
  ): void {
    const clientIP =
      context.req.header("x-forwarded-for") ||
      context.req.header("x-real-ip") ||
      "unknown";

    const logLevel = success ? "info" : "warn";
    const message = success
      ? "Setup attempt successful"
      : "Setup attempt failed";

    Logger[logLevel](message, {
      clientIP,
      userAgent: context.req.header("user-agent"),
      origin: context.req.header("origin"),
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  static logAuthenticationEvent(
    event: string,
    context: Context,
    userId?: string,
    details?: any
  ): void {
    const clientIP =
      context.req.header("x-forwarded-for") ||
      context.req.header("x-real-ip") ||
      "unknown";

    Logger.info(`Authentication event: ${event}`, {
      clientIP,
      userId,
      userAgent: context.req.header("user-agent"),
      timestamp: new Date().toISOString(),
      ...details,
    });
  }
}

/**
 * Request context utilities for error handling
 */
export class RequestContext {
  static getClientInfo(context: Context) {
    return {
      ip:
        context.req.header("x-forwarded-for") ||
        context.req.header("x-real-ip") ||
        "unknown",
      userAgent: context.req.header("user-agent") || "unknown",
      origin: context.req.header("origin") || "unknown",
      referer: context.req.header("referer") || "unknown",
      method: context.req.method,
      url: context.req.url,
      timestamp: new Date().toISOString(),
    };
  }

  static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
