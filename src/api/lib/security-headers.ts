import { loadConfig } from "./config";

export function applySecurityHeaders(response: Response): Response {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; " +
      "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
      "font-src 'self'; connect-src 'self'",
  );
  if (loadConfig().nodeEnv === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

type RouteHandler = (request: Request) => Response | Promise<Response>;

export function secureRouteMap<T extends Record<string, unknown>>(routes: T): T {
  const secured: Record<string, unknown> = {};
  for (const [path, definition] of Object.entries(routes)) {
    if (!definition || typeof definition !== "object") {
      secured[path] = definition;
      continue;
    }
    const wrapped = { ...(definition as Record<string, unknown>) };
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const handler = wrapped[method];
      if (typeof handler !== "function") continue;
      wrapped[method] = async (request: Request) =>
        applySecurityHeaders(await (handler as RouteHandler)(request));
    }
    secured[path] = wrapped;
  }
  return secured as T;
}
