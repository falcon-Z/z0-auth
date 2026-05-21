import { CSRF_HEADER } from "@shared/contracts/http";

let csrfToken: string | null = null;

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function ensureCsrf(): Promise<string> {
  const existing = getCookie("z0_csrf");
  if (existing) {
    csrfToken = existing;
    return existing;
  }

  const res = await fetch("/api/setup/status");
  const cookie = getCookie("z0_csrf");
  if (cookie) {
    csrfToken = cookie;
    return cookie;
  }

  if (!res.ok) throw new Error("Failed to initialize CSRF");
  if (!cookie) throw new Error("CSRF cookie not set");
  csrfToken = cookie;
  return cookie;
}

export type ApiProblem = {
  title: string;
  status: number;
  detail?: string;
  errors?: { field: string; code: string; message: string }[];
};

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<{ ok: true; data: T } | { ok: false; problem: ApiProblem }> {
  const token = csrfToken ?? (await ensureCsrf());
  const headers = new Headers(options.headers);
  headers.set(CSRF_HEADER, token);
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      problem: {
        title: data.title ?? "Error",
        status: res.status,
        detail: data.detail,
        errors: data.errors,
      },
    };
  }
  return { ok: true, data: data as T };
}
