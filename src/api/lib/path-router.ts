import type { BunRequest } from "bun";

import type { MethodHandlers, RouteHandler } from "./http";
import { methodNotAllowed } from "./http";
import { safeDecodeURIComponent } from "@z0/contracts/validation";

export type PathParams = Record<string, string>;

export type PathRoute = {
  pattern: string;
  handlers: MethodHandlers | RouteHandler;
};

function matchPath(pattern: string, pathname: string): PathParams | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: PathParams = {};
  for (let i = 0; i < patternParts.length; i++) {
    const segment = patternParts[i];
    const value = pathParts[i];
    if (segment.startsWith(":")) {
      const decoded = safeDecodeURIComponent(value);
      if (decoded === null) return null;
      params[segment.slice(1)] = decoded;
    } else if (segment !== value) {
      return null;
    }
  }
  return params;
}

export type RoutedRequest = BunRequest & { pathParams?: PathParams };

export async function dispatchPatternRoutes(
  routes: PathRoute[],
  req: Request,
  wrap?: (pathname: string, handler: RouteHandler) => RouteHandler,
): Promise<Response | null> {
  const url = new URL(req.url);
  for (const route of routes) {
    const params = matchPath(route.pattern, url.pathname);
    if (!params) continue;

    const routed = req as RoutedRequest;
    routed.pathParams = params;

    if (typeof route.handlers === "function") {
      const handler = wrap ? wrap(url.pathname, route.handlers) : route.handlers;
      return handler(routed);
    }

    const method = req.method as keyof MethodHandlers;
    const handler = route.handlers[method];
    if (!handler) {
      const allowed = Object.keys(route.handlers).filter((m) => route.handlers[m as keyof MethodHandlers]);
      return methodNotAllowed(allowed);
    }

    const wrapped = wrap ? wrap(url.pathname, handler) : handler;
    return wrapped(routed);
  }
  return null;
}
