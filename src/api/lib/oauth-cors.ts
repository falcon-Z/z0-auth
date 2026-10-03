import { getDb } from "./db";
import { isSerializedHttpOrigin } from "./browser-origins";

/** CORS authority is registered explicitly on a public child client. */
export function isOriginAllowedForClient(origin: string | null, browserOrigins: string[]): boolean {
  return isSerializedHttpOrigin(origin) && browserOrigins.includes(origin);
}
export async function isOAuthCorsOriginAllowed(origin: string | null, clientId: string): Promise<boolean> {
  if (!isSerializedHttpOrigin(origin) || !clientId) return false;
  const [row] = await getDb()`SELECT c.id FROM oauth_clients c JOIN apps a ON a.id = c.app_id
    WHERE c.client_id = ${clientId} AND c.status = 'active' AND a.status = 'active' AND c.client_type = 'public'
      AND c.purpose = 'interactive' AND ${origin} = ANY(c.browser_origins) LIMIT 1`;
  return Boolean(row);
}

export function buildOAuthCorsHeaders(origin: string | null, method = "POST"): Headers {
  const headers = new Headers({ "Vary": "Origin", "Cache-Control": "no-store" });
  if (!origin) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", `${method}, OPTIONS`);
  headers.set("Access-Control-Allow-Headers", method === "POST" ? "Content-Type, Idempotency-Key" : "Authorization");
  return headers;
}

export function withOAuthCors(response: Response, origin: string | null, allowed: boolean, method = "POST"): Response {
  const headers = new Headers(response.headers);
  const vary = headers.get("Vary")?.split(",").map(value => value.trim()) ?? [];
  if (!vary.some(value => value.toLowerCase() === "origin")) vary.push("Origin");
  headers.set("Vary", vary.join(", "));
  if (origin && allowed) {
    for (const [key, value] of buildOAuthCorsHeaders(origin, method)) {
      if (key !== "vary") headers.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
