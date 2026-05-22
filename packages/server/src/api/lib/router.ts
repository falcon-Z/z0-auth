import type { BunRequest } from "bun";

import type { MethodHandlers, RouteHandler } from "./http";
import { methodNotAllowed } from "./http";
import { checkSetupGuard } from "./setup-guard";

type RouteMap = Record<string, MethodHandlers | RouteHandler>;

function wrapHandler(pathname: string, handler: RouteHandler): RouteHandler {
  return async (req: BunRequest) => {
    const guard = await checkSetupGuard(pathname);
    if (guard) return guard;
    return handler(req);
  };
}

export function applySetupGuard(routes: RouteMap): RouteMap {
  const wrapped: RouteMap = {};
  for (const [pathname, handlers] of Object.entries(routes)) {
    if (typeof handlers === "function") {
      wrapped[pathname] = wrapHandler(pathname, handlers);
      continue;
    }
    const methodHandlers: MethodHandlers = {};
    for (const [method, handler] of Object.entries(handlers)) {
      if (handler) {
        methodHandlers[method as keyof MethodHandlers] = wrapHandler(pathname, handler);
      }
    }
    wrapped[pathname] = methodHandlers;
  }
  return wrapped;
}

export async function dispatchRoute(
  routes: RouteMap,
  req: Request,
): Promise<Response | null> {
  const url = new URL(req.url);
  const handlers = routes[url.pathname];
  if (!handlers) return null;

  if (typeof handlers === "function") {
    return handlers(req as BunRequest);
  }

  const method = req.method as keyof MethodHandlers;
  const handler = handlers[method];
  if (!handler) {
    const allowed = Object.keys(handlers).filter((m) => handlers[m as keyof MethodHandlers]);
    return methodNotAllowed(allowed);
  }

  return handler(req as BunRequest);
}
