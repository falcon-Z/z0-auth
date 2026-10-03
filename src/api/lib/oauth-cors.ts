import { getDb } from "./db";

/** CORS authority is registered explicitly on a public child client. */
export function isOriginAllowedForClient(origin: string | null, browserOrigins: string[]): boolean {
  return Boolean(origin && browserOrigins.includes(origin));
}
export async function isOAuthCorsOriginAllowed(origin: string | null): Promise<boolean> {
  if (!origin) return false;
  const [row] = await getDb()`SELECT c.id FROM oauth_clients c JOIN apps a ON a.id = c.app_id
    WHERE c.status = 'active' AND a.status = 'active' AND c.client_type = 'public'
      AND c.purpose = 'interactive' AND ${origin} = ANY(c.browser_origins) LIMIT 1`;
  return Boolean(row);
}

export function buildOAuthCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (!origin) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Vary", "Origin");
  return headers;
}

export function withOAuthCors(response: Response, origin: string | null, allowed: boolean): Response {
  if (!origin || !allowed) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of buildOAuthCorsHeaders(origin)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
