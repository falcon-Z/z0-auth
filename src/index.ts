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

import { logger, generateRequestId, CORS_POLICIES, generateCORSHeaders } from '@z0/src/lib';
import { ensureServerStartupReadiness } from '@z0/src/server-startup';
import { handleLivenessCheck, handleReadinessCheck } from '@z0/src/api/core/health/health';
import { handleBootstrapStatus, handleBootstrapInitialize } from '@z0/src/api/v1/bootstrap/bootstrap';
import type { RequestContext } from '@z0/src/lib';

const CANONICAL_OPENAPI_SPEC_PATH = new URL('../docs/openapi/specs/openapi.yaml', import.meta.url);
const CANONICAL_FRONTEND_SHELL_PATH = new URL('./index.html', import.meta.url);
const CANONICAL_SCRIPT_TAG = '<script type="module" src="./frontend.tsx"></script>';
const ROUTED_SERVER_SCRIPT_TAG = '<script type="module" src="/src/frontend.tsx"></script>';
const canonicalFrontendShellPromise = Bun.file(CANONICAL_FRONTEND_SHELL_PATH).text();

// ============================================================================
// Middleware Pipeline Types
// ============================================================================

export type MiddlewareNext = () => Promise<Response>;
export type Middleware = (req: Request, context: RequestContext, next: MiddlewareNext) => Promise<Response>;

function resolveEndpointClass(path: string): 'public' | 'browser' | 'server' | 'admin' {
  if (path.startsWith('/.well-known')) {
    return 'public';
  }

  if (path.startsWith('/auth') || path.startsWith('/login')) {
    return 'browser';
  }

  if (path.startsWith('/api/admin')) {
    return 'admin';
  }

  if (path.startsWith('/api')) {
    return 'server';
  }

  return 'public';
}

function getCorsHeadersForRequest(req: Request): Record<string, string> {
  const path = new URL(req.url).pathname;
  const endpointClass = resolveEndpointClass(path);
  const policy = CORS_POLICIES[endpointClass];
  return generateCORSHeaders(policy, req.headers.get('origin') || undefined);
}

// ============================================================================
// Request Context Middleware
// ============================================================================

/**
 * Initialize request context with ID, timestamp, and actor information
 */
async function requestContextMiddleware(req: Request, ctx: RequestContext, next: MiddlewareNext): Promise<Response> {
  // Ensure the shared per-request context is fully initialized once.
  ctx.requestId = ctx.requestId || generateRequestId();
  ctx.timestamp = ctx.timestamp || new Date();

  logger.info(`${req.method} ${new URL(req.url).pathname}`, { requestId: ctx.requestId }, ctx.requestId);
  
  return next();
}

// ============================================================================
// CORS Middleware
// ============================================================================

/**
 * Apply CORS headers based on endpoint class
 */
async function corsMiddleware(req: Request, _ctx: RequestContext, next: MiddlewareNext): Promise<Response> {
  const corsHeaders = getCorsHeadersForRequest(req);

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

// Health Check Endpoints are in src/api/core/health/health.ts

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
      headers: {
        'Content-Type': 'application/json',
        Allow: 'GET',
      },
    });
  }

  try {
    const path = new URL(req.url).pathname;
    const yamlSpec = await Bun.file(CANONICAL_OPENAPI_SPEC_PATH).text();

    if (path.endsWith('.json')) {
      const parsedSpec = Bun.YAML.parse(yamlSpec);

      return Response.json(parsedSpec, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }

    return new Response(yamlSpec, {
      status: 200,
      headers: {
        'Content-Type': 'application/yaml; charset=utf-8',
      },
    });
  } catch (error) {
    logger.error('Failed to load canonical OpenAPI spec', error instanceof Error ? error : new Error(String(error)));

    return Response.json(
      {
        error: 'Failed to load OpenAPI specification',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Bootstrap Wizard HTML Endpoint
// ============================================================================

async function bootstrapHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const canonicalShell = await canonicalFrontendShellPromise;
  const routedShell = canonicalShell.replace(CANONICAL_SCRIPT_TAG, ROUTED_SERVER_SCRIPT_TAG);

  return new Response(routedShell, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
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
  handler: (req: Request, context?: RequestContext) => Promise<Response> | Response;
}

const routes: Route[] = [
  // Health checks (split liveness and readiness)
  { pattern: '/health/live', method: 'GET', handler: handleLivenessCheck },
  { pattern: '/health/ready', method: 'GET', handler: handleReadinessCheck },
  
  // Legacy health endpoint (redirect to liveness for backward compat)
  { pattern: '/health', method: 'GET', handler: handleLivenessCheck },
  
  // OpenAPI discovery
  { pattern: '/.well-known/openapi.json', method: 'GET', handler: openApiHandler },
  { pattern: '/.well-known/openapi.yaml', method: 'GET', handler: openApiHandler },
  
  // Bootstrap API endpoints
  { pattern: '/api/v1/bootstrap/status', method: 'GET', handler: handleBootstrapStatus },
  { pattern: '/api/v1/bootstrap/initialize', method: 'POST', handler: handleBootstrapInitialize },
  
  // Bootstrap UI (wizard)
  { pattern: '/', method: 'GET', handler: bootstrapHandler },
  { pattern: /^\/bootstrap\/?$/, method: 'GET', handler: bootstrapHandler },
  { pattern: /^\/console\/?$/, method: 'GET', handler: bootstrapHandler },
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

/**
 * Get supported HTTP methods for a matching route path pattern.
 */
function getAllowedMethodsForPath(path: string): string[] {
  const methods: string[] = [];

  for (const route of routes) {
    const matchesPath = typeof route.pattern === 'string'
      ? path === route.pattern
      : route.pattern.test(path);

    if (!matchesPath) continue;
    if (!methods.includes(route.method)) {
      methods.push(route.method);
    }
  }

  return methods;
}

// ============================================================================
// Middleware Chain Executor
// ============================================================================

/**
 * Execute middleware chain with proper error handling
 */
export async function executeMiddlewareChain(
  req: Request,
  middlewares: Middleware[],
  handler: (req: Request, context: RequestContext) => Promise<Response> | Response
): Promise<Response> {
  let index = -1;

  // Create one shared context per request and pass it across all middleware/handler calls.
  const context: RequestContext = {
    requestId: generateRequestId(),
    timestamp: new Date(),
    actor: { type: 'system', id: 'bootstrap' },
    authLevel: 'unauthenticated',
  };

  const dispatch = async (i: number): Promise<Response> => {
    if (i <= index) return new Response('Multiple next() calls', { status: 500 });
    index = i;

    if (i === middlewares.length) {
      return handler(req, context);
    }

    const middleware = middlewares[i];
    return middleware(req, context, () => dispatch(i + 1));
  };

  return dispatch(0);
}

// ============================================================================
// Main Request Handler
// ============================================================================

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const middlewares: Middleware[] = [requestContextMiddleware, corsMiddleware, bootstrapMiddleware];

  try {
    if (req.method === 'OPTIONS') {
      return await executeMiddlewareChain(req, middlewares, () => new Response(null, { status: 204 }));
    }

    const route = matchRoute(req.method, url.pathname);
    const allowedMethods = route ? [] : getAllowedMethodsForPath(url.pathname);

    if (!route) {
      if (allowedMethods.length > 0) {
        const corsHeaders = getCorsHeadersForRequest(req);
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          {
            status: 405,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              Allow: allowedMethods.join(', '),
            },
          }
        );
      }

      const corsHeaders = getCorsHeadersForRequest(req);

      return new Response(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: 'Endpoint not found',
          },
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return await executeMiddlewareChain(req, middlewares, route.handler);
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

export interface ServerAddressConfig {
  port: number;
  bindHost: string;
  displayHost: string;
}

export function resolveServerAddressConfig(
  env: Record<string, string | undefined> = process.env,
): ServerAddressConfig {
  const parsedPort = parseInt(env.PORT || '3000', 10);

  return {
    port: Number.isFinite(parsedPort) ? parsedPort : 3000,
    bindHost: env.BIND_HOST || '0.0.0.0',
    displayHost: env.DISPLAY_HOST || 'localhost',
  };
}

export function renderStartupBanner({ port, displayHost }: ServerAddressConfig): string {
  const origin = `http://${displayHost}:${port}`;

  return `
╔═════════════════════════════════════════════════════════════╗
║                    Z0 Auth Server                           ║
╠═════════════════════════════════════════════════════════════╣
║ 🚀 Server running at ${origin}
║ 📚 API Docs:  ${origin}/.well-known/openapi.json
║ 🏥 Health:    ${origin}/health
║ 🔧 Setup:     ${origin}/
╚═════════════════════════════════════════════════════════════╝
`;
}

// ============================================================================
// Server Initialization
// ============================================================================

if (import.meta.main) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const { port, bindHost, displayHost } = resolveServerAddressConfig();

  await ensureServerStartupReadiness();

  const server = await Bun.serve({
    port,
    hostname: bindHost,
    fetch: handleRequest,
    development: isDevelopment && {
      hmr: true,
      console: true,
    },
  });

  console.log(renderStartupBanner({ port, bindHost, displayHost }));

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.stop();
    process.exit(0);
  });
}
