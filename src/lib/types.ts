/**
 * Z0 Auth - Request Context and Actor Types
 * 
 * Every HTTP request carries context about the actor (who is making the request),
 * their authorization level, and which tenant/app context they're operating within.
 */

import type { JWTPayload } from 'bun';

/** Actor types in the system */
export type ActorType = 'system' | 'platform' | 'tenant' | 'app' | 'identity';

/** Possible authorization levels */
export type AuthorizationLevel =
  | 'unauthenticated'     // Bootstrap or public endpoints
  | 'app_credential'      // App ID + secret (server-to-server)
  | 'api_key'             // API key (server-to-server or user)
  | 'access_token'        // Bearer token (identity session)
  | 'platform_admin'      // Platform super admin
  | 'tenant_admin'        // Tenant admin
  | 'app_operator';       // App operator/developer

/** JWT Claims - structure locked in Phase 0 */
export interface Z0TokenClaims extends JWTPayload {
  // Standard JWT claims
  iss: string;              // Issuer (e.g., 'z0-auth.example.com')
  sub: string;              // Subject (identity UUID)
  aud: string;              // Audience (app UUID, since multi-tenant)
  iat: number;              // Issued at (unix timestamp)
  exp: number;              // Expiration (unix timestamp)
  // Z0-specific claims
  scope: string;            // Space-separated scope list
  tenant_id: string;        // Tenant UUID
  app_id: string;           // App UUID
  session_id: string;       // Session UUID (for replay detection and revocation)
  // Refresh token specific
  type?: 'access' | 'refresh'; // Token type
  family_id?: string;       // Refresh token family ID (for replay detection)
}

/** Request context - attached to every request by middleware */
export interface RequestContext {
  requestId: string;        // Unique request identifier (UUID v4)
  timestamp: Date;          // Request arrival timestamp
  actor: Actor;             // Who is making the request
  authLevel: AuthorizationLevel; // How they authenticated
  tenant?: TenantContext;   // Which tenant context (if any)
  authorization?: {         // What they're authorized to do
    level: AuthorizationLevel;
    scopes: string[];
  };
}

/** Actor - the entity making the request */
export interface Actor {
  type: ActorType;
  id: string;
  email?: string;           // For identity actors
}

/** Tenant context - multi-tenant awareness */
export interface TenantContext {
  id: string;               // Tenant UUID
  name: string;             // Tenant name
}

/** Bootstrap state in the request */
export interface BootstrapState {
  isBootstrapped: boolean;
  bootstrapToken?: string;  // One-time use bootstrap token
  platforms?: Array<{ id: string; name: string }>;
}

/** Standardized pagination envelope */
export interface PaginationEnvelope<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

/** Standardized error envelope (for non-2xx responses) */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    traceId?: string;
  };
  timestamp: string;
}

/** Standard HTTP response envelope */
export interface ResponseEnvelope<T> {
  success: boolean;
  data: T;
  timestamp: string;
  requestId?: string;
}

/** Standard validation error format */
export interface ValidationErrorDetail {
  field: string;
  code: string; // e.g., 'required', 'pattern', 'min_length'
  message: string;
}

export interface ValidationError {
  code: 'VALIDATION_ERROR';
  errors: ValidationErrorDetail[];
}
