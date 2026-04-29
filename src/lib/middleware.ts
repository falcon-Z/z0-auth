/**
 * Z0 Auth - Request Context and Authentication Middleware
 * 
 * Middleware for:
 * - Creating and populating request context
 * - Extracting and verifying authentication credentials
 * - Setting authorization level and scopes
 * 
 * This is the contract layer between HTTP transport and domain logic.
 */

import type { RequestContext, AuthorizationLevel, Z0TokenClaims } from '@z0/src/lib/types';
import { extractBearerToken, extractBasicAuth, generateRequestId, logger } from '@z0/src/lib/index';
import { createError } from '@z0/src/lib/errors';

/**
 * Context builder - progressively populates request context through middleware chain
 */
export class ContextBuilder {
  private context: RequestContext;

  constructor(requestId?: string) {
    this.context = {
      requestId: requestId || generateRequestId(),
      timestamp: new Date(),
      actor: { type: 'system', id: 'bootstrap' },
      authLevel: 'unauthenticated',
    };
  }

  /**
   * Set the actor (who is making the request)
   */
  setActor(type: RequestContext['actor']['type'], id: string, email?: string): this {
    this.context.actor = { type, id, email };
    return this;
  }

  /**
   * Set tenant context
   */
  setTenant(id: string, name: string): this {
    this.context.tenant = { id, name };
    return this;
  }

  /**
   * Set authorization level and scopes
   */
  setAuthorization(level: AuthorizationLevel, scopes: string[] = []): this {
    this.context.authLevel = level;
    this.context.authorization = { level, scopes };
    return this;
  }

  /**
   * Get the built context
   */
  build(): RequestContext {
    return this.context;
  }

  /**
   * Clone the context for modification
   */
  clone(): ContextBuilder {
    const builder = new ContextBuilder(this.context.requestId);
    builder.context = JSON.parse(JSON.stringify(this.context));
    return builder;
  }
}

/**
 * Authentication extractor - determines which auth mechanism is being used
 */
export type AuthMechanism = 'none' | 'bearer' | 'basic' | 'bootstrap_token' | 'api_key';

export interface ExtractedAuth {
  mechanism: AuthMechanism;
  credentials?: {
    username?: string;
    password?: string;
    token?: string;
  };
}

/**
 * Extract authentication from request headers
 */
export function extractAuth(req: Request): ExtractedAuth {
  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    // Check for bootstrap token in query parameter (only for bootstrap routes)
    const url = new URL(req.url);
    const bootstrapToken = url.searchParams.get('token');
    if (bootstrapToken) {
      return {
        mechanism: 'bootstrap_token',
        credentials: { token: bootstrapToken },
      };
    }
    return { mechanism: 'none' };
  }

  const bearerToken = extractBearerToken(authHeader);
  if (bearerToken) {
    return {
      mechanism: 'bearer',
      credentials: { token: bearerToken },
    };
  }

  const basicAuth = extractBasicAuth(authHeader);
  if (basicAuth) {
    return {
      mechanism: 'basic',
      credentials: { username: basicAuth.username, password: basicAuth.password },
    };
  }

  // Check for API key in Authorization: ApiKey z0_pk_<keyId>_<secret>
  const apiKeyMatch = authHeader.match(/^ApiKey\s+(.+)$/i);
  if (apiKeyMatch) {
    return {
      mechanism: 'api_key',
      credentials: { token: apiKeyMatch[1] },
    };
  }

  return { mechanism: 'none' };
}

/**
 * Verify and parse a JWT token
 * For now, returns null - actual implementation requires JWT library
 */
export async function verifyAccessToken(token: string): Promise<Z0TokenClaims | null> {
  // TODO: Implement JWT verification
  // Should verify:
  // 1. Signature using public key
  // 2. Expiration
  // 3. Issuer
  // 4. Audience
  return null;
}

/**
 * Verify app credentials (ID + secret)
 */
export async function verifyAppCredentials(
  clientId: string,
  clientSecret: string
): Promise<{ appId: string; scopes: string[] } | null> {
  // TODO: Implement with database query
  // Should:
  // 1. Look up app by client_id
  // 2. Verify client_secret hash
  // 3. Return app context and scopes
  return null;
}

/**
 * Verify API key
 */
export async function verifyAPIKey(apiKeyFull: string): Promise<{ keyId: string; appId: string } | null> {
  // TODO: Implement with database query
  // Parse format: z0_pk_<keyId>_<secret>
  // 1. Extract keyId and secret
  // 2. Look up key in database
  // 3. Verify secret hash
  // 4. Return key context
  return null;
}

/**
 * Authentication middleware factory
 * 
 * This middleware:
 * 1. Extracts authentication from request
 * 2. Verifies credentials based on mechanism
 * 3. Populates context with actor and authorization level
 * 4. Passes context to next middleware/handler
 */
export async function authenticationMiddleware(
  req: Request,
  contextBuilder: ContextBuilder,
  next: (ctx: RequestContext) => Promise<Response>
): Promise<Response> {
  const auth = extractAuth(req);
  const requestId = contextBuilder.build().requestId;

  logger.debug('Authentication extraction', { mechanism: auth.mechanism }, requestId);

  try {
    switch (auth.mechanism) {
      case 'none': {
        // Unauthenticated request - allowed for public endpoints
        contextBuilder.setAuthorization('unauthenticated');
        break;
      }

      case 'bearer': {
        // Access token authentication
        const token = auth.credentials?.token;
        if (!token) {
          throw createError('INVALID_TOKEN', 'Bearer token is empty');
        }

        const claims = await verifyAccessToken(token);
        if (!claims) {
          throw createError('INVALID_TOKEN', 'Token verification failed');
        }

        contextBuilder
          .setActor('identity', claims.sub, undefined)
          .setTenant(claims.tenant_id, 'tenant-name-from-db')
          .setAuthorization('access_token', claims.scope.split(' '));

        break;
      }

      case 'basic': {
        // App credentials authentication (server-to-server)
        const { username: clientId, password: clientSecret } = auth.credentials!;
        if (!clientId || !clientSecret) {
          throw createError('INVALID_CREDENTIALS', 'Basic auth credentials are incomplete');
        }

        const app = await verifyAppCredentials(clientId, clientSecret);
        if (!app) {
          throw createError('INVALID_CREDENTIALS', 'App credentials verification failed');
        }

        contextBuilder
          .setActor('app', app.appId)
          .setAuthorization('app_credential', app.scopes);

        break;
      }

      case 'api_key': {
        // API key authentication
        const token = auth.credentials?.token;
        if (!token) {
          throw createError('INVALID_TOKEN', 'API key is empty');
        }

        const key = await verifyAPIKey(token);
        if (!key) {
          throw createError('INVALID_TOKEN', 'API key verification failed');
        }

        contextBuilder
          .setActor('app', key.appId)
          .setAuthorization('api_key');

        break;
      }

      case 'bootstrap_token': {
        // Bootstrap token (one-time use for initial setup)
        const token = auth.credentials?.token;
        if (!token) {
          throw createError('INVALID_TOKEN', 'Bootstrap token is empty');
        }

        // TODO: Verify bootstrap token from database
        contextBuilder.setAuthorization('unauthenticated');
        break;
      }
    }

    return next(contextBuilder.build());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    logger.warn('Authentication failure', { mechanism: auth.mechanism, message }, requestId);

    return Response.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message,
        },
      },
      { status: 401 }
    );
  }
}

/**
 * Authorization middleware - enforces minimum required authorization level
 * 
 * Usage: authorizationMiddleware(req, context, ['tenant_admin', 'platform_admin'], next)
 */
export async function authorizationMiddleware(
  req: Request,
  context: RequestContext,
  requiredLevels: AuthorizationLevel[],
  next: (ctx: RequestContext) => Promise<Response>
): Promise<Response> {
  if (!requiredLevels.includes(context.authLevel)) {
    logger.warn(
      'Authorization denied',
      {
        actor: context.actor.id,
        required: requiredLevels,
        actual: context.authLevel,
      },
      context.requestId
    );

    return Response.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
      },
      { status: 403 }
    );
  }

  return next(context);
}
