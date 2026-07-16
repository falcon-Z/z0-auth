import type { BunRequest } from "bun";

export function isHtmxRequest(req: Request): boolean {
  return req.headers.get("HX-Request") === "true";
}

/** Full navigation for HTMX; 303 redirect for plain form POST. */
export function htmlFormRedirect(
  req: Request,
  location: string,
  options?: { setCookie?: string; setCookies?: string[] },
): Response {
  const path = location.startsWith("/") ? location : "/";
  const headers = new Headers();

  if (options?.setCookie) headers.append("Set-Cookie", options.setCookie);
  for (const cookie of options?.setCookies ?? []) headers.append("Set-Cookie", cookie);

  if (isHtmxRequest(req)) {
    headers.set("HX-Redirect", path);
    return new Response(null, { status: 200, headers });
  }

  headers.set("Location", path);
  return new Response(null, { status: 303, headers });
}

/** HTMX swaps only run for 2xx unless configured; allow auth validation responses. */
export function htmxAuthErrorHeaders(): HeadersInit {
  return { "HX-Reswap": "outerHTML", "HX-Retarget": "#auth-root" };
}

export function authFormErrorStatus(req: BunRequest, fallback: number): number {
  return isHtmxRequest(req) ? 200 : fallback;
}
