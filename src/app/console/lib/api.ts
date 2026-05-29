import type { SessionResponse } from "@z0/contracts/auth";
import { CSRF_COOKIE, CSRF_HEADER } from "@z0/contracts/http";

export type SessionLoadResult =
  | { kind: "authenticated"; session: SessionResponse }
  | { kind: "login" }
  | { kind: "setup" };

function readCsrfCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Ensures `z0_csrf` is present (via setup status, allowed before and after setup). */
export async function ensureCsrfCookie(): Promise<string> {
  let token = readCsrfCookie();
  if (token) return token;

  await fetch("/api/setup/status", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  token = readCsrfCookie();
  if (!token) throw new Error("CSRF token unavailable");
  return token;
}

export async function loadSession(): Promise<SessionLoadResult> {
  const res = await fetch("/api/auth/session", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (res.status === 503) return { kind: "setup" };
  if (!res.ok) return { kind: "login" };

  const session = (await res.json()) as SessionResponse;
  if (!session.authenticated) return { kind: "login" };
  return { kind: "authenticated", session };
}

export async function postLogout(): Promise<void> {
  const csrf = await ensureCsrfCookie();
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      [CSRF_HEADER]: csrf,
    },
  });
  if (!res.ok) throw new Error("Sign out failed");
}

export async function postActiveTenant(tenantId: string): Promise<SessionResponse> {
  const csrf = await ensureCsrfCookie();
  const res = await fetch("/api/auth/active-tenant", {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      [CSRF_HEADER]: csrf,
    },
    body: JSON.stringify({ tenantId }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? "Could not switch organization");
  }

  return (await res.json()) as SessionResponse;
}
