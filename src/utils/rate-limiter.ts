/**
 * Rate limiting utility for API endpoints
 * Implements in-memory rate limiting with configurable windows and limits
 */

import type { Context } from "hono";
import { Logger, SecurityLogger, ErrorResponseBuilder } from "./error-handling";

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string; // Custom error message
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

/**
 * In-memory store for rate limiting (in production, use Redis or similar)
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries from the rate limit store
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Get client identifier for rate limiting
 * Uses IP address as the primary identifier
 */
function getClientId(c: Context): string {
  const forwardedFor = c.req.header('x-forwarded-for');
  const realIp = c.req.header('x-real-ip');
  const cfConnectingIp = c.req.header('cf-connecting-ip');
  
  let clientIp = forwardedFor?.split(',')[0]?.trim() || 
                 realIp || 
                 cfConnectingIp || 
                 'unknown';
  
  if (clientIp === 'unknown') {
    clientIp = 'localhost';
  }
  
  return `rate_limit:${clientIp}`;
}

/**
 * Create a rate limiting middleware
 */
export function createRateLimit(config: RateLimitConfig) {
  return async (c: Context, next: () => Promise<void>) => {
    if (Math.random() < 0.1) {
      cleanupExpiredEntries();
    }
    
    const clientId = getClientId(c);
    const now = Date.now();
    
    let entry = rateLimitStore.get(clientId);
    
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + config.windowMs,
        firstRequest: now,
      };
      rateLimitStore.set(clientId, entry);
    }
    
    if (entry.count >= config.maxRequests) {
      const resetIn = Math.ceil((entry.resetTime - now) / 1000);
      
      SecurityLogger.logSuspiciousActivity('Rate limit exceeded', c, {
        clientId,
        count: entry.count,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
        resetIn,
        endpoint: c.req.url
      });
      
      const errorResponse = ErrorResponseBuilder.security(
        config.message || "Too many requests",
        'RATE_LIMIT_EXCEEDED',
        {
          retryAfter: resetIn,
          limit: config.maxRequests,
          windowMs: config.windowMs,
          resetTime: entry.resetTime
        }
      );
      
      return c.json(
        errorResponse,
        429,
        {
          'Retry-After': resetIn.toString(),
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': entry.resetTime.toString(),
        }
      );
    }
    
    entry.count++;
    rateLimitStore.set(clientId, entry);
    
    const originalCount = entry.count;
    
    try {
      await next();
      
      if (config.skipSuccessfulRequests && c.res.status < 400) {
        entry.count = originalCount - 1;
        rateLimitStore.set(clientId, entry);
      }
    } catch (error) {
      if (config.skipFailedRequests) {
        entry.count = originalCount - 1;
        rateLimitStore.set(clientId, entry);
      }
      throw error;
    }
    
    const remaining = Math.max(0, config.maxRequests - entry.count);
    c.res.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
    c.res.headers.set('X-RateLimit-Remaining', remaining.toString());
    c.res.headers.set('X-RateLimit-Reset', entry.resetTime.toString());
  };
}

/**
 * Predefined rate limit configurations for common use cases
 */
export const rateLimitConfigs = {
  strict: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    message: "Too many setup attempts. Please try again later.",
  },
  
  auth: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 10,
    message: "Too many authentication attempts. Please try again later.",
  },
  
  general: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 100,
    message: "Too many requests. Please try again later.",
  },
  
  public: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 1000,
    message: "Rate limit exceeded. Please try again later.",
  },
};

/**
 * Get current rate limit status for a client
 */
export function getRateLimitStatus(c: Context, config: RateLimitConfig) {
  const clientId = getClientId(c);
  const entry = rateLimitStore.get(clientId);
  const now = Date.now();
  
  if (!entry || now > entry.resetTime) {
    return {
      limit: config.maxRequests,
      remaining: config.maxRequests,
      reset: now + config.windowMs,
      resetIn: Math.ceil(config.windowMs / 1000),
    };
  }
  
  return {
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    reset: entry.resetTime,
    resetIn: Math.ceil((entry.resetTime - now) / 1000),
  };
}

/**
 * Clear rate limit for a specific client (useful for testing or admin override)
 */
export function clearRateLimit(c: Context): void {
  const clientId = getClientId(c);
  rateLimitStore.delete(clientId);
}

/**
 * Clear all rate limit entries (useful for testing)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}