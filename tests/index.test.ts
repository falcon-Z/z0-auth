import { describe, expect, it } from 'bun:test';
import { executeMiddlewareChain, handleRequest, type Middleware } from '../src/index';
import type { RequestContext } from '../src/lib';

describe('Request routing', () => {
  it('returns 405 with Allow header for known path and unsupported method', async () => {
    const response = await handleRequest(new Request('http://localhost:3000/health/live', {
      method: 'POST',
    }));

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD, OPTIONS');

    const body = await response.json() as { error: string };
    expect(body.error).toBe('Method not allowed');
  });

  it('returns 404 for unknown path', async () => {
    const response = await handleRequest(new Request('http://localhost:3000/unknown-path', {
      method: 'GET',
    }));

    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD, OPTIONS');
  });

  it('returns 204 for OPTIONS preflight with CORS headers', async () => {
    const response = await handleRequest(new Request('http://localhost:3000/health/live', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
      },
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD, OPTIONS');
  });

  it('serves canonical OpenAPI spec as JSON from discovery .json endpoint', async () => {
    const response = await handleRequest(new Request('http://localhost:3000/.well-known/openapi.json', {
      method: 'GET',
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');

    const body = await response.json() as { openapi: string; info: { title: string } };
    expect(body.openapi).toBe('3.1.0');
    expect(body.info.title).toBe('Z0 Auth API');
  });

  it('serves canonical OpenAPI spec as YAML from discovery .yaml endpoint', async () => {
    const response = await handleRequest(new Request('http://localhost:3000/.well-known/openapi.yaml', {
      method: 'GET',
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/yaml');

    const body = await response.text();
    expect(body).toContain('openapi: 3.1.0');
    expect(body).toContain('title: Z0 Auth API');
  });

  it('returns 405 with Allow header for non-GET discovery request', async () => {
    const response = await handleRequest(new Request('http://localhost:3000/.well-known/openapi.json', {
      method: 'POST',
    }));

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');

    const body = await response.json() as { error: string };
    expect(body.error).toBe('Method not allowed');
  });

  it('serves bootstrap frontend shell from root and console routes with the correct script path', async () => {
    const rootResponse = await handleRequest(new Request('http://localhost:3000/', {
      method: 'GET',
    }));
    expect(rootResponse.status).toBe(200);
    const rootHtml = await rootResponse.text();
    expect(rootHtml).toContain('<div id="root"></div>');
    expect(rootHtml).toContain('<script type="module" src="/src/frontend.tsx"></script>');

    const consoleResponse = await handleRequest(new Request('http://localhost:3000/console', {
      method: 'GET',
    }));
    expect(consoleResponse.status).toBe(200);
    const consoleHtml = await consoleResponse.text();
    expect(consoleHtml).toContain('<div id="root"></div>');
    expect(consoleHtml).toContain('<script type="module" src="/src/frontend.tsx"></script>');
  });

  it('propagates a shared RequestContext across middleware and handler', async () => {
    const contexts: RequestContext[] = [];
    type ContextWithTrace = RequestContext & { trace?: string };

    const middlewares: Middleware[] = [
      async (_req, ctx, next) => {
        contexts.push(ctx);
        (ctx as ContextWithTrace).trace = 'set-by-middleware-1';
        return next();
      },
      async (_req, ctx, next) => {
        contexts.push(ctx);
        expect((ctx as ContextWithTrace).trace).toBe('set-by-middleware-1');
        (ctx as ContextWithTrace).trace = 'updated-by-middleware-2';
        return next();
      },
    ];

    const response = await executeMiddlewareChain(
      new Request('http://localhost:3000/health/live', { method: 'GET' }),
      middlewares,
      async (_req, ctx) => {
        contexts.push(ctx);
        expect((ctx as ContextWithTrace).trace).toBe('updated-by-middleware-2');
        return Response.json({ requestId: ctx.requestId });
      }
    );

    expect(response.status).toBe(200);
    expect(contexts.length).toBe(3);
    expect(contexts[0]).toBe(contexts[1]);
    expect(contexts[1]).toBe(contexts[2]);

    const body = await response.json() as { requestId: string };
    expect(body.requestId).toBeTruthy();
  });
});
