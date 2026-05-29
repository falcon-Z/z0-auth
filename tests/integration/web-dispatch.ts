import type { BunRequest } from "bun";

import { authWebRoutes } from "../../src/web/auth/routes";
import { oauthWebRoutes } from "../../src/web/oauth/routes";

type MethodHandlers = {
  GET?: (req: BunRequest) => Response | Promise<Response>;
  POST?: (req: BunRequest) => Response | Promise<Response>;
  HEAD?: (req: BunRequest) => Response | Promise<Response>;
};

export async function dispatchWeb(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const routes = {
    ...authWebRoutes,
    ...oauthWebRoutes,
  } as const;
  const handlers = (routes as Record<string, MethodHandlers>)[url.pathname];
  if (!handlers) return new Response("Not found", { status: 404 });

  const method = req.method as keyof MethodHandlers;
  const handler = handlers[method];
  if (!handler) return new Response("Method not allowed", { status: 405 });

  return handler(req as BunRequest);
}
