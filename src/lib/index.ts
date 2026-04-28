/**
 * Z0 Auth - Library Exports
 * Central point for importing common utilities
 */

// Error handling
export { Z0Error, createError, isZ0Error, type ErrorCode, type ErrorContext } from './errors';

// Types and contracts
export type {
  ActorType,
  AuthorizationLevel,
  Z0TokenClaims,
  RequestContext,
  Actor,
  TenantContext,
  BootstrapState,
  PaginationEnvelope,
  ErrorEnvelope,
  ResponseEnvelope,
  ValidationErrorDetail,
  ValidationError,
} from './types';

// Validation
export { Validator, PATTERNS, schemas, type ValidationSchema, type ValidationResult } from './validation';

// Logging
export { logger, type LogLevel, type LogEntry } from './logger';

// Cryptography
export {
  hashSecret,
  verifySecret,
  generateRandomString,
  generateAPIKey,
  hashAPIKey,
  verifyAPIKey,
  generateHMAC,
  verifyHMAC,
} from './crypto';

// Rate limiting
export {
  rateLimiter,
  RATE_LIMIT_DEFAULTS,
  type RateLimitClass,
  type RateLimitConfig,
  RateLimiter,
} from './rate-limit';

// HTTP utilities
export {
  CORS_POLICIES,
  generateCORSHeaders,
  generateRequestId,
  extractBearerToken,
  extractBasicAuth,
  type EndpointClass,
  type CORSPolicy,
} from './http';

// Middleware and context
export {
  ContextBuilder,
  extractAuth,
  verifyAccessToken,
  verifyAppCredentials,
  verifyAPIKey as verifyAPIKeyFromDB,
  authenticationMiddleware,
  authorizationMiddleware,
  type AuthMechanism,
  type ExtractedAuth,
} from './middleware';
