import { describe, expect, it } from 'bun:test';
import {
  executeMiddlewareChain,
  handleRequest,
  renderStartupBanner,
  resolveServerAddressConfig,
  type Middleware,
} from '@z0/src/index';
import type { RequestContext } from '@z0/src/lib';

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

  it('serves bootstrap frontend shell from canonical template for app shell routes', async () => {
    const shellRoutes = [
      '/',
      '/bootstrap',
      '/bootstrap/',
      '/console',
      '/console/',
      '/setup',
      '/setup/',
      '/sign-in',
      '/sign-in/',
    ];

    for (const route of shellRoutes) {
      const response = await handleRequest(new Request(`http://localhost:3000${route}`, {
        method: 'GET',
      }));

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('/frontend.tsx');
      expect(html).toContain('/frontend.css');
      expect(html).not.toContain('./frontend.tsx');
    }
  });

  it('serves a browser-executable frontend module from the emitted shell script src path', async () => {
    const shellResponse = await handleRequest(new Request('http://localhost:3000/', {
      method: 'GET',
    }));

    expect(shellResponse.status).toBe(200);
    const html = await shellResponse.text();
    const scriptSrcMatch = html.match(/<script\s+type="module"\s+src="([^"]+)"/i);

    expect(scriptSrcMatch).toBeTruthy();
    const modulePath = scriptSrcMatch?.[1];
    expect(modulePath).toBeTruthy();

    const moduleResponse = await handleRequest(new Request(`http://localhost:3000${modulePath}`, {
      method: 'GET',
    }));

    expect(moduleResponse.status).toBe(200);
    expect(moduleResponse.headers.get('Content-Type')).toContain('javascript');
  });

  it('serves a stylesheet bundle from the emitted shell stylesheet href', async () => {
    const shellResponse = await handleRequest(new Request('http://localhost:3000/', {
      method: 'GET',
    }));

    expect(shellResponse.status).toBe(200);
    const html = await shellResponse.text();
    const stylesheetHrefMatch = html.match(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?\s*>/i);

    expect(stylesheetHrefMatch).toBeTruthy();
    const stylesheetPath = stylesheetHrefMatch?.[1];
    expect(stylesheetPath).toBeTruthy();

    const stylesheetResponse = await handleRequest(new Request(`http://localhost:3000${stylesheetPath}`, {
      method: 'GET',
    }));

    expect(stylesheetResponse.status).toBe(200);
    expect(stylesheetResponse.headers.get('Content-Type')).toContain('text/css');

    const css = await stylesheetResponse.text();
    expect(css.length).toBeGreaterThan(0);
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

describe('Standalone HTML shell', () => {
  it('keeps the expected title and loads frontend module after #root without async', async () => {
    const shell = await Bun.file(new URL('../src/index.html', import.meta.url)).text();

    expect(shell).toContain('<title>Z0 Auth</title>');
    expect(shell).toContain('<script type="module" src="./frontend.tsx"></script>');
    expect(shell).not.toContain('src="./frontend.tsx" async');

    const rootIndex = shell.indexOf('<div id="root"></div>');
    const scriptIndex = shell.indexOf('<script type="module" src="./frontend.tsx"></script>');

    expect(rootIndex).toBeGreaterThanOrEqual(0);
    expect(scriptIndex).toBeGreaterThan(rootIndex);
  });
});

describe('Server startup banner', () => {
  it('uses localhost display URLs by default and points setup users at root', () => {
    const config = resolveServerAddressConfig({});
    const banner = renderStartupBanner(config);

    expect(config.bindHost).toBe('0.0.0.0');
    expect(config.displayHost).toBe('localhost');
    expect(banner).toContain('http://localhost:3000');
    expect(banner).toContain('http://localhost:3000/');
    expect(banner).not.toContain('/bootstrap');
    expect(banner).not.toContain('Phase 1');
  });

  it('keeps bind host separate from display URLs unless display host is explicitly configured', () => {
    const defaultDisplayConfig = resolveServerAddressConfig({
      PORT: '4010',
      BIND_HOST: '127.0.0.1',
    });

    expect(renderStartupBanner(defaultDisplayConfig)).toContain('http://localhost:4010');
    expect(renderStartupBanner(defaultDisplayConfig)).not.toContain('http://127.0.0.1:4010');

    const overriddenDisplayConfig = resolveServerAddressConfig({
      PORT: '4010',
      BIND_HOST: '0.0.0.0',
      DISPLAY_HOST: 'devbox.internal',
    });

    const banner = renderStartupBanner(overriddenDisplayConfig);
    expect(banner).toContain('http://devbox.internal:4010');
    expect(banner).not.toContain('http://localhost:4010');
  });
});
