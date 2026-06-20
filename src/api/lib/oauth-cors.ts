import { getDb } from "./db";

/** Origins derived from registered redirect URIs (scheme + host + port). */
export function originsFromRedirectUris(redirectUris: string[]): Set<string> {
  const origins = new Set<string>();
  for (const uri of redirectUris) {
    try {
      origins.add(new URL(uri).origin);
    } catch {
      // ignore invalid stored URIs
    }
  }
  return origins;
}

export function isOriginAllowedForClient(origin: string | null, redirectUris: string[]): boolean {
  if (!origin) return false;
  return originsFromRedirectUris(redirectUris).has(origin);
}

export async function isOAuthCorsOriginAllowed(origin: string | null): Promise<boolean> {
  if (!origin) return false;
  const rows = await getDb()`
    SELECT redirect_uris
    FROM apps
    WHERE status = 'active'
  `;
  for (const row of rows as { redirect_uris: string[] }[]) {
    if (isOriginAllowedForClient(origin, row.redirect_uris ?? [])) return true;
  }
  return false;
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
