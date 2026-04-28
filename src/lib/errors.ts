/**
 * Z0 Auth - Error Hierarchy and Standard Transport Envelope
 * 
 * All errors are mapped to HTTP status codes and returned in a standard JSON envelope
 * for consistent error handling across API boundaries.
 */

export type ErrorCode =
  // 400 Bad Request
  | 'VALIDATION_ERROR'
  | 'INVALID_REQUEST'
  | 'MALFORMED_CREDENTIALS'
  | 'INVALID_GRANT'
  | 'UNSUPPORTED_GRANT_TYPE'
  | 'UNSUPPORTED_RESPONSE_TYPE'
  | 'INVALID_SCOPE'
  | 'INVALID_CLIENT_ID'
  // 401 Unauthorized
  | 'UNAUTHORIZED'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'INVALID_CREDENTIALS'
  | 'MFA_REQUIRED'
  | 'SESSION_EXPIRED'
  // 403 Forbidden
  | 'FORBIDDEN'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'TENANT_MISMATCH'
  | 'RESOURCE_MISMATCH'
  // 404 Not Found
  | 'NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'TENANT_NOT_FOUND'
  | 'APP_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  // 409 Conflict
  | 'CONFLICT'
  | 'RESOURCE_EXISTS'
  | 'CONCURRENT_MODIFICATION'
  // 429 Rate Limited
  | 'RATE_LIMIT_EXCEEDED'
  // 500 Internal Server Error
  | 'INTERNAL_ERROR'
  | 'DATABASE_ERROR'
  | 'SMTP_ERROR'
  | 'SERVICE_UNAVAILABLE';

export interface ErrorContext {
  code: ErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  traceId?: string;
}

export class Z0Error extends Error {
  constructor(
    public code: ErrorCode,
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>,
    public traceId?: string
  ) {
    super(message);
    this.name = 'Z0Error';
    Object.setPrototypeOf(this, Z0Error.prototype);
  }

  toJSON(): ErrorContext {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details }),
      ...(this.traceId && { traceId: this.traceId }),
    };
  }
}

// HTTP Status Code Mapping
export const ErrorCodeToStatusCode: Record<ErrorCode, number> = {
  // 400
  VALIDATION_ERROR: 400,
  INVALID_REQUEST: 400,
  MALFORMED_CREDENTIALS: 400,
  INVALID_GRANT: 400,
  UNSUPPORTED_GRANT_TYPE: 400,
  UNSUPPORTED_RESPONSE_TYPE: 400,
  INVALID_SCOPE: 400,
  INVALID_CLIENT_ID: 400,
  // 401
  UNAUTHORIZED: 401,
  INVALID_TOKEN: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  MFA_REQUIRED: 401,
  SESSION_EXPIRED: 401,
  // 403
  FORBIDDEN: 403,
  INSUFFICIENT_PERMISSIONS: 403,
  TENANT_MISMATCH: 403,
  RESOURCE_MISMATCH: 403,
  // 404
  NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  TENANT_NOT_FOUND: 404,
  APP_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  // 409
  CONFLICT: 409,
  RESOURCE_EXISTS: 409,
  CONCURRENT_MODIFICATION: 409,
  // 429
  RATE_LIMIT_EXCEEDED: 429,
  // 500
  INTERNAL_ERROR: 500,
  DATABASE_ERROR: 500,
  SMTP_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  traceId?: string
): Z0Error {
  const statusCode = ErrorCodeToStatusCode[code] || 500;
  return new Z0Error(code, statusCode, message, details, traceId);
}

export function isZ0Error(error: unknown): error is Z0Error {
  return error instanceof Z0Error;
}
