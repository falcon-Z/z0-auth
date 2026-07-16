import type { BunRequest } from "bun";

import { appInviteWebRoutes } from "../../src/web/auth/app-invite-routes";
import { appSessionsWebRoutes } from "../../src/web/auth/app-sessions-routes";
import { authWebRoutes } from "../../src/web/auth/routes";
import { federationWebRoutes } from "../../src/web/auth/federation-routes";
import { inviteWebRoutes } from "../../src/web/auth/invite-routes";
import { emailVerificationWebRoutes } from "../../src/web/auth/email-verification-routes";
import { oauthWebRoutes } from "../../src/web/oauth/routes";
import { mfaWebRoutes } from "../../src/web/auth/mfa-routes";
import { appMfaWebRoutes } from "../../src/web/auth/app-mfa-routes";

type MethodHandlers = {
  GET?: (req: BunRequest) => Response | Promise<Response>;
  POST?: (req: BunRequest) => Response | Promise<Response>;
  HEAD?: (req: BunRequest) => Response | Promise<Response>;
};

function tokenFromPath(pathname: string, prefix: string): string | null {
  const match = pathname.match(new RegExp(`^${prefix}/([a-f0-9]+)$`, "i"));
  return match?.[1] ?? null;
}

export async function dispatchWeb(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const inviteToken = tokenFromPath(url.pathname, "/auth/invite");
  if (inviteToken) {
    const handlers = inviteWebRoutes["/auth/invite/:token"];
    const method = req.method as keyof MethodHandlers;
    const handler = handlers[method];
    if (!handler) return new Response("Method not allowed", { status: 405 });
    return handler(req as BunRequest);
  }

  const appInviteToken = tokenFromPath(url.pathname, "/auth/app-invite");
  if (appInviteToken) {
    const handlers = appInviteWebRoutes["/auth/app-invite/:token"];
    const method = req.method as keyof MethodHandlers;
    const handler = handlers[method];
    if (!handler) return new Response("Method not allowed", { status: 405 });
    return handler(req as BunRequest);
  }

  const federationMatch = url.pathname.match(/^\/auth\/federation\/([^/]+)\/(start|callback)$/);
  if (federationMatch) {
    const providerKey = decodeURIComponent(federationMatch[1]!);
    const suffix = federationMatch[2] as "start" | "callback";
    const routeKey =
      suffix === "start"
        ? "/auth/federation/:providerKey/start"
        : "/auth/federation/:providerKey/callback";
    const handlers = federationWebRoutes[routeKey];
    const method = req.method as keyof MethodHandlers;
    const handler = handlers[method];
    if (!handler) return new Response("Method not allowed", { status: 405 });
    const bunReq = req as BunRequest;
    (bunReq as BunRequest & { params: { providerKey: string } }).params = { providerKey };
    return handler(bunReq);
  }

  const verificationMatch = url.pathname.match(/^\/auth\/verify-email\/([^/]+)(\/accept)?$/);
  if (verificationMatch) {
    const routeKey = verificationMatch[2]
      ? "/auth/verify-email/:token/accept"
      : "/auth/verify-email/:token";
    const handlers = emailVerificationWebRoutes[routeKey];
    const method = req.method as keyof MethodHandlers;
    const handler = handlers[method];
    if (!handler) return new Response("Method not allowed", { status: 405 });
    return handler(req as BunRequest);
  }

  const routes = {
    ...authWebRoutes,
    ...appSessionsWebRoutes,
    ...emailVerificationWebRoutes,
    ...oauthWebRoutes,
    ...mfaWebRoutes,
    ...appMfaWebRoutes,
  } as const;
  const handlers = (routes as Record<string, MethodHandlers>)[url.pathname];
  if (!handlers) return new Response("Not found", { status: 404 });

  const method = req.method as keyof MethodHandlers;
  const handler = handlers[method];
  if (!handler) return new Response("Method not allowed", { status: 405 });

  return handler(req as BunRequest);
}
