import type { BunRequest } from "bun";

import { createProblemDetail } from "@z0/contracts/errors";

export type RouteHandler = (req: BunRequest) => Response | Promise<Response>;

export type MethodHandlers = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS", RouteHandler>>;

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
  return json(createProblemDetail(status, title, detail, extra), {
    status,
    headers: { "Content-Type": "application/problem+json; charset=utf-8" },
  });
}

export function methodNotAllowed(allowed: string[]): Response {
  const response = problem(405, "Method Not Allowed", undefined, { allowed });
  response.headers.set("Allow", allowed.join(", "));
  return response;
}
