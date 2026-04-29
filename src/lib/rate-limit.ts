/**
 * Z0 Auth - Rate Limiting Utilities
 * 
 * Sliding window rate limiting with PostgreSQL backend.
 * Rate limits are enforced per route class (bootstrap, identity, platform, etc.)
 */

import { logger } from '@z0/src/lib/logger';
import { createError } from '@z0/src/lib/errors';

export type RateLimitClass = 'bootstrap' | 'identity' | 'platform' | 'tenant' | 'admin';

export interface RateLimitConfig {
  requests: number;       // Number of requests allowed
  windowSeconds: number;  // Time window in seconds
  class: RateLimitClass;
}

// Platform defaults for each rate limit class (Phase 1 decision)
export const RATE_LIMIT_DEFAULTS: Record<RateLimitClass, RateLimitConfig> = {
  bootstrap: { requests: 10, windowSeconds: 60, class: 'bootstrap' },      // 10 per minute
  identity: { requests: 100, windowSeconds: 60, class: 'identity' },       // 100 per minute
  platform: { requests: 1000, windowSeconds: 60, class: 'platform' },      // 1000 per minute
  tenant: { requests: 5000, windowSeconds: 60, class: 'tenant' },          // 5000 per minute
  admin: { requests: 10000, windowSeconds: 60, class: 'admin' },           // 10000 per minute
};

/**
 * Rate limiter that uses a PostgreSQL backend for distributed counting
 * (Implementation will be provided in Phase 3 when DB is available)
 */
export class RateLimiter {
  constructor(private db?: any) {} // DB connection injected during initialization

  async checkLimit(
    identifier: string,           // IP, tenant ID, user ID, etc.
    config: RateLimitConfig,
    requestId?: string
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    // This will be implemented in Phase 3 with actual database calls
    // For now, return permissive defaults
    logger.debug(
      'Rate limit check',
      { identifier, class: config.class, requests: config.requests },
      requestId
    );

    return {
      allowed: true,
      remaining: config.requests,
      resetAt: new Date(Date.now() + config.windowSeconds * 1000),
    };
  }

  async recordRequest(
    identifier: string,
    config: RateLimitConfig,
    requestId?: string
  ): Promise<void> {
    logger.debug('Recording request for rate limit', { identifier, class: config.class }, requestId);
    // Implementation in Phase 3
  }
}

export const rateLimiter = new RateLimiter();
