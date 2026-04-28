/**
 * Z0 Auth - Main Server Entry Point
 * 
 * Sets up Bun-native HTTP server with:
 * - Middleware pipeline (request context, CORS, rate limiting)
 * - Bootstrap state detection
 * - Module-composed routing
 * - Structured error handling
 * - HMR support in development
 */

import { logger, generateRequestId, CORS_POLICIES, generateCORSHeaders } from './lib';
import { ensureServerStartupReadiness } from './server-startup';
import { handleLivenessCheck, handleReadinessCheck } from './api/health';
import { handleBootstrapStatus, handleBootstrapInitialize } from './api/bootstrap';
import type { RequestContext } from './lib';

// ============================================================================
// Middleware Pipeline Types
// ============================================================================

export type MiddlewareNext = () => Promise<Response>;
export type Middleware = (req: Request, context: RequestContext, next: MiddlewareNext) => Promise<Response>;

// ============================================================================
// Request Context Middleware
// ============================================================================

/**
 * Initialize request context with ID, timestamp, and actor information
 */
async function requestContextMiddleware(req: Request, _ctx: RequestContext, next: MiddlewareNext): Promise<Response> {
  const requestId = generateRequestId();
  const timestamp = new Date();
  
  logger.info(`${req.method} ${new URL(req.url).pathname}`, { requestId }, requestId);
  
  return next();
}

// ============================================================================
// CORS Middleware
// ============================================================================

/**
 * Apply CORS headers based on endpoint class
 */
async function corsMiddleware(req: Request, _ctx: RequestContext, next: MiddlewareNext): Promise<Response> {
  // Determine endpoint class from path
  const url = new URL(req.url);
  const path = url.pathname;
  
  let endpointClass: 'public' | 'browser' | 'server' | 'admin' = 'public';
  
  if (path.startsWith('/.well-known')) {
    endpointClass = 'public';
  } else if (path.startsWith('/auth') || path.startsWith('/login')) {
    endpointClass = 'browser';
  } else if (path.startsWith('/api/admin')) {
    endpointClass = 'admin';
  } else if (path.startsWith('/api')) {
    endpointClass = 'server';
  }

  const policy = CORS_POLICIES[endpointClass];
  const corsHeaders = generateCORSHeaders(policy, req.headers.get('origin') || undefined);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const response = await next();
  
  // Add CORS headers to response
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

// ============================================================================
// Bootstrap State Middleware
// ============================================================================

/**
 * Detect bootstrap state and add to request context
 * Bootstrap routes bypass normal auth and serve setup wizard
 */
async function bootstrapMiddleware(req: Request, _ctx: RequestContext, next: MiddlewareNext): Promise<Response> {
  const url = new URL(req.url);
  const isBootstrapRoute = url.pathname.startsWith('/bootstrap') || url.pathname === '/';
  
  if (isBootstrapRoute) {
    logger.debug('Bootstrap route detected', { path: url.pathname });
  }

  return next();
}

// Health Check Endpoints are now in src/api/health.ts

// ============================================================================
// OpenAPI Discovery Endpoint
// ============================================================================

/**
 * Serve OpenAPI/Swagger spec for API discovery
 */
async function openApiHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return Response.json({
    openapi: '3.1.0',
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: {
      title: 'Z0 Auth API',
      version: '0.1.0',
      description: 'Self-hostable authentication and IAM service',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development',
      },
    ],
    tags: [
      { name: 'Health', description: 'Service liveness and readiness endpoints' },
      { name: 'Bootstrap', description: 'One-time initialization endpoints' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Legacy liveness endpoint',
          operationId: 'getHealthLegacy',
          responses: {
            '200': {
              description: 'Server process is alive.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LivenessResponse' },
                },
              },
            },
          },
        },
      },
      '/health/live': {
        get: {
          tags: ['Health'],
          summary: 'Liveness probe',
          operationId: 'getHealthLive',
          responses: {
            '200': {
              description: 'Server process is alive.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LivenessResponse' },
                },
              },
            },
          },
        },
      },
      '/health/ready': {
        get: {
          tags: ['Health'],
          summary: 'Readiness probe',
          operationId: 'getHealthReady',
          responses: {
            '200': {
              description: 'Service is ready for traffic.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReadinessResponse' },
                },
              },
            },
            '503': {
              description: 'Service is not ready for traffic.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReadinessResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/bootstrap/status': {
        get: {
          tags: ['Bootstrap'],
          summary: 'Get bootstrap status',
          operationId: 'getBootstrapStatus',
          responses: {
            '200': {
              description: 'Bootstrap status returned.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BootstrapStatusResponse' },
                },
              },
            },
            '500': {
              description: 'Failed to query bootstrap status.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/bootstrap/initialize': {
        post: {
          tags: ['Bootstrap'],
          summary: 'Initialize platform bootstrap',
          operationId: 'postBootstrapInitialize',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BootstrapInitializeRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Platform initialized successfully.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BootstrapInitializeResponse' },
                },
              },
            },
            '400': {
              description: 'Invalid request body or validation error.',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      { $ref: '#/components/schemas/ErrorResponse' },
                      { $ref: '#/components/schemas/ValidationErrorResponse' },
                    ],
                  },
                },
              },
            },
            '405': {
              description: 'Method not allowed.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '409': {
              description: 'Platform already initialized.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '500': {
              description: 'Internal bootstrap failure.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        LivenessResponse: {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'timestamp', 'uptime'],
          properties: {
            status: { type: 'string', const: 'ok' },
            timestamp: { type: 'string', format: 'date-time' },
            uptime: { type: 'number', minimum: 0 },
          },
        },
        MigrationStatus: {
          type: 'object',
          additionalProperties: false,
          required: ['applied', 'total', 'pending'],
          properties: {
            applied: { type: 'integer', minimum: 0 },
            total: { type: 'integer', minimum: 0 },
            pending: { type: 'integer', minimum: 0 },
          },
        },
        DatabaseReadiness: {
          type: 'object',
          additionalProperties: false,
          required: ['connected', 'migrations'],
          properties: {
            connected: { type: 'boolean' },
            migrations: { $ref: '#/components/schemas/MigrationStatus' },
          },
        },
        ReadinessResponse: {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'database', 'timestamp'],
          properties: {
            status: { type: 'string', enum: ['ready', 'not_ready'] },
            database: { $ref: '#/components/schemas/DatabaseReadiness' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        BootstrapStatusResponse: {
          type: 'object',
          additionalProperties: false,
          required: ['bootstrapped', 'requires_setup', 'timestamp'],
          properties: {
            bootstrapped: { type: 'boolean' },
            requires_setup: { type: 'boolean' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        BootstrapInitializeRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['platform_name', 'admin_email', 'admin_password', 'confirm_password'],
          properties: {
            platform_name: { type: 'string', minLength: 3, maxLength: 255 },
            admin_email: { type: 'string', format: 'email' },
            admin_password: {
              type: 'string',
              minLength: 12,
              pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{12,}$',
            },
            confirm_password: { type: 'string', minLength: 12 },
          },
        },
        BootstrapInitializeResponse: {
          type: 'object',
          additionalProperties: false,
          required: ['platform_id', 'bootstrap_token', 'admin_email', 'setup_complete', 'timestamp'],
          properties: {
            platform_id: { type: 'string', format: 'uuid' },
            bootstrap_token: { type: 'string' },
            admin_email: { type: 'string', format: 'email' },
            setup_complete: { type: 'boolean', const: true },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        ErrorResponse: {
          type: 'object',
          additionalProperties: false,
          required: ['error'],
          properties: {
            error: { type: 'string' },
          },
        },
        ValidationErrorResponse: {
          type: 'object',
          additionalProperties: false,
          required: ['error', 'details'],
          properties: {
            error: { type: 'string', const: 'Validation failed' },
            details: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
        },
      },
    },
  });
}

// ============================================================================
// Bootstrap Wizard HTML Endpoint (TODO: React component in Phase 1)
// ============================================================================

async function bootstrapHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  // TODO: Serve React component from src/App.tsx
  return new Response(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Z0 Auth - Setup Wizard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="/frontend.tsx"></script>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' },
  });
}

// ============================================================================
// 404 Handler
// ============================================================================

async function notFoundHandler(): Promise<Response> {
  return Response.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    },
    { status: 404 }
  );
}

// ============================================================================
// Router
// ============================================================================

interface Route {
  pattern: string | RegExp;
  method: string;
  handler: (req: Request) => Promise<Response> | Response;
}

const routes: Route[] = [
  // Health checks (split liveness and readiness)
  { pattern: '/health/live', method: 'GET', handler: handleLivenessCheck },
  { pattern: '/health/ready', method: 'GET', handler: handleReadinessCheck },
  
  // Legacy health endpoint (redirect to liveness for backward compat)
  { pattern: '/health', method: 'GET', handler: handleLivenessCheck },
  
  // OpenAPI discovery
  { pattern: '/.well-known/openapi.json', method: 'GET', handler: openApiHandler },
  
  // Bootstrap API endpoints
  { pattern: '/api/v1/bootstrap/status', method: 'GET', handler: handleBootstrapStatus },
  { pattern: '/api/v1/bootstrap/initialize', method: 'POST', handler: handleBootstrapInitialize },
  
  // Bootstrap UI (wizard)
  { pattern: '/', method: 'GET', handler: bootstrapHandler },
  { pattern: /^\/bootstrap\/?$/, method: 'GET', handler: bootstrapHandler },
];

/**
 * Route a request to the appropriate handler
 */
function matchRoute(method: string, path: string): Route | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    
    if (typeof route.pattern === 'string') {
      if (path === route.pattern) return route;
    } else if (route.pattern instanceof RegExp) {
      if (route.pattern.test(path)) return route;
    }
  }
  return null;
}

// ============================================================================
// Middleware Chain Executor
// ============================================================================

/**
 * Execute middleware chain with proper error handling
 */
async function executeMiddlewareChain(
  req: Request,
  middlewares: Middleware[],
  handler: (req: Request) => Promise<Response> | Response
): Promise<Response> {
  let index = -1;

  const dispatch = async (i: number): Promise<Response> => {
    if (i <= index) return new Response('Multiple next() calls', { status: 500 });
    index = i;

    // Initialize context (will be populated by middleware)
    const context: RequestContext = {
      requestId: generateRequestId(),
      timestamp: new Date(),
      actor: { type: 'system', id: 'bootstrap' },
      authLevel: 'unauthenticated',
    };

    if (i === middlewares.length) {
      return handler(req);
    }

    const middleware = middlewares[i];
    return middleware(req, context, () => dispatch(i + 1));
  };

  return dispatch(0);
}

// ============================================================================
// Main Request Handler
// ============================================================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const route = matchRoute(req.method, url.pathname);

  const middlewares: Middleware[] = [requestContextMiddleware, corsMiddleware, bootstrapMiddleware];

  try {
    if (!route) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: 'Endpoint not found',
          },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return await executeMiddlewareChain(req, middlewares, () => route.handler(req));
  } catch (error) {
    logger.error('Request handling error', error instanceof Error ? error : new Error(String(error)));
    return Response.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Server Initialization
// ============================================================================

const isDevelopment = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000');
const hostname = process.env.HOSTNAME || 'localhost';

await ensureServerStartupReadiness();

const server = await Bun.serve({
  port,
  hostname,
  fetch: handleRequest,
  development: isDevelopment && {
    hmr: true,
    console: true,
  },
});

console.log(`
╔═════════════════════════════════════════════════════════════╗
║                    Z0 Auth Server                           ║
║                    Phase 1 - Foundation                     ║
╠═════════════════════════════════════════════════════════════╣
║ 🚀 Server running at http://${hostname}:${port}
║ 📚 API Docs:  http://${hostname}:${port}/.well-known/openapi.json
║ 🏥 Health:    http://${hostname}:${port}/health
║ 🔧 Setup:     http://${hostname}:${port}/bootstrap
╚═════════════════════════════════════════════════════════════╝
`);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
