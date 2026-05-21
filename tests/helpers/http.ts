import { CSRF_COOKIE, CSRF_HEADER } from "@shared/contracts/http";

export function buildRequest(
  method: string,
  pathname: string,
  options: {
    body?: unknown;
    csrfToken?: string;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers = new Headers(options.headers ?? {});
  const host = "localhost";
  headers.set("host", host);
  headers.set("origin", `http://${host}`);

  if (options.csrfToken) {
    headers.set(CSRF_HEADER, options.csrfToken);
  }

  const cookieParts: string[] = [];
  if (options.csrfToken) {
    cookieParts.push(`${CSRF_COOKIE}=${encodeURIComponent(options.csrfToken)}`);
  }
  if (options.cookies) {
    for (const [k, v] of Object.entries(options.cookies)) {
      cookieParts.push(`${k}=${encodeURIComponent(v)}`);
    }
  }
  if (cookieParts.length > 0) {
    headers.set("cookie", cookieParts.join("; "));
  }

  return new Request(`http://${host}${pathname}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

export async function fetchCsrfToken(dispatch: (req: Request) => Promise<Response>): Promise<string> {
  const res = await dispatch(buildRequest("GET", "/api/setup/status"));
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const raw = setCookie.find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  if (!raw) throw new Error("CSRF cookie missing");
  const match = raw.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
  if (!match?.[1]) throw new Error("CSRF cookie parse failed");
  return decodeURIComponent(match[1]);
}
