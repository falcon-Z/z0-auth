import { loadConfig } from "../api/lib/config";
import { csrfCookieHeader, ensureCsrfToken } from "../api/lib/csrf";

export function preparePageCsrf(req: Request): { token: string; setCookie?: string } {
  const { token, setCookie } = ensureCsrfToken(req);
  if (!setCookie) return { token };
  const config = loadConfig();
  return { token, setCookie: csrfCookieHeader(token, config.nodeEnv === "production") };
}

export function withSetCookie(response: Response, cookie: string | undefined): Response {
  if (!cookie) return response;
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
