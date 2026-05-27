import type { BunRequest } from "bun";

export type RouteHandler = (req: BunRequest) => Response | Promise<Response>;

export type MethodHandlers = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", RouteHandler>>;

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  return Response.json(data, { ...init, headers });
}

export function problem(
  status: number,
  title: string,
  detail?: string,
  extra?: Record<string, unknown>,
): Response {
  return json(
    {
      type: "about:blank",
      title,
      status,
      detail,
      ...extra,
    },
    { status },
  );
}

export function methodNotAllowed(allowed: string[]): Response {
  return problem(405, "Method Not Allowed", undefined, { allowed });
}
