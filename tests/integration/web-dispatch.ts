import type { BunRequest } from "bun";

import { authWebRoutes } from "../../src/web/auth/routes";
import { inviteWebRoutes } from "../../src/web/auth/invite-routes";
import { oauthWebRoutes } from "../../src/web/oauth/routes";

type MethodHandlers = {
  GET?: (req: BunRequest) => Response | Promise<Response>;
  POST?: (req: BunRequest) => Response | Promise<Response>;
  HEAD?: (req: BunRequest) => Response | Promise<Response>;
};

function inviteTokenFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/auth\/invite\/([a-f0-9]+)$/i);
  return match?.[1] ?? null;
}

export async function dispatchWeb(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const inviteToken = inviteTokenFromPath(url.pathname);
  if (inviteToken) {
    const handlers = inviteWebRoutes["/auth/invite/:token"];
    const method = req.method as keyof MethodHandlers;
    const handler = handlers[method];
    if (!handler) return new Response("Method not allowed", { status: 405 });
    return handler(req as BunRequest);
  }

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
