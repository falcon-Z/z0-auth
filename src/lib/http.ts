/**
 * Z0 Auth - CORS and Request Utilities
 * 
 * CORS policy enforcement by route class
 * Request ID generation and tracking
 */

export type EndpointClass = 'public' | 'browser' | 'server' | 'admin';

export interface CORSPolicy {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

/**
 * CORS policies by endpoint class
 */
export const CORS_POLICIES: Record<EndpointClass, CORSPolicy> = {
  // Public endpoints (/.well-known/*, /api/v1/health, etc.)
  public: {
    allowedOrigins: ['*'],
    allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    exposedHeaders: ['Content-Type'],
    credentials: false,
    maxAge: 86400,
  },

  // Browser-facing endpoints (OAuth2 authorize, login UI, etc.)
  browser: {
    allowedOrigins: ['*'], // Configured per tenant in future
    allowedMethods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Cookie'],
    exposedHeaders: ['Content-Type', 'Set-Cookie'],
    credentials: true,
    maxAge: 3600,
  },

  // Server-to-server endpoints (app credential auth)
  server: {
    allowedOrigins: [],  // No origins; use Authorization header instead
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['Content-Type', 'X-RateLimit-*'],
    credentials: false,
    maxAge: 3600,
  },

  // Admin endpoints (platform/tenant admin operations)
  admin: {
    allowedOrigins: [],  // Must use Authorization header
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['Content-Type', 'X-RateLimit-*'],
    credentials: false,
    maxAge: 3600,
  },
};

/**
 * Generate CORS headers for a request
 */
export function generateCORSHeaders(
  policy: CORSPolicy,
  requestOrigin?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': policy.allowedMethods.join(', '),
    'Access-Control-Allow-Headers': policy.allowedHeaders.join(', '),
    'Access-Control-Expose-Headers': policy.exposedHeaders.join(', '),
    'Access-Control-Max-Age': String(policy.maxAge),
  };

  if (policy.credentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  // Handle allowed origins
  if (policy.allowedOrigins.includes('*')) {
    headers['Access-Control-Allow-Origin'] = '*';
  } else if (
    requestOrigin &&
    policy.allowedOrigins.some((origin) => matchOrigin(origin, requestOrigin))
  ) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
  }

  return headers;
}

/**
 * Match origin against pattern (supports wildcards)
 */
function matchOrigin(pattern: string, origin: string): boolean {
  if (pattern === '*') return true;
  if (pattern === origin) return true;

  // Handle wildcard subdomains: *.example.com
  if (pattern.startsWith('*.')) {
    const domain = pattern.slice(2);
    return origin.endsWith('.' + domain) || origin.endsWith(domain);
  }

  return false;
}

/**
 * Generate a unique request ID (UUID v4)
 */
export function generateRequestId(): string {
  const now = Date.now();
  const rand = Math.random().toString(36).substring(2, 15);
  const randHex = Math.random().toString(16).substring(2);

  // Simple UUID v4-like generator
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1

  return Array.from(bytes)
    .map((b, i) => {
      if (i === 4 || i === 6 || i === 8 || i === 10) return '-' + b.toString(16).padStart(2, '0');
      return b.toString(16).padStart(2, '0');
    })
    .join('')
    .replace(/^-/, '');
}

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Extract basic auth credentials from Authorization header
 */
export function extractBasicAuth(authHeader?: string): { username: string; password: string } | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Basic\s+(.+)$/i);
  if (!match) return null;

  const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
  const [username, password] = decoded.split(':');

  if (!username || !password) return null;
  return { username, password };
}
