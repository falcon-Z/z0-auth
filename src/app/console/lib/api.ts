import type { SessionResponse } from "@z0/contracts/auth";
import { ErrorCodes } from "@z0/contracts/errors";

import { apiFetch } from "./http-client";

export type { SessionResponse } from "@z0/contracts/auth";
export { ApiError, apiFetch, ensureCsrfCookie } from "./http-client";
export {
  fieldErrorsFromProblem,
  fieldErrorsFromUnknown,
  firstFieldError,
  type FieldErrorMap,
} from "./form-errors";

export type SessionLoadResult =
  | { kind: "authenticated"; session: SessionResponse }
  | { kind: "login" }
  | { kind: "setup" }
  | { kind: "unavailable" };

export async function loadSession(): Promise<SessionLoadResult> {
  const res = await fetch("/api/auth/session", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (res.status === 503) {
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    if (body.code === ErrorCodes.DATABASE_UNAVAILABLE) return { kind: "unavailable" };
    return { kind: "setup" };
  }
  if (!res.ok) return { kind: "login" };

  const session = (await res.json()) as SessionResponse;
  if (!session.authenticated) return { kind: "login" };
  return { kind: "authenticated", session };
}

export async function postLogout(): Promise<void> {
  await apiFetch<void>("/api/auth/logout", { method: "POST" });
}

export async function postActiveTenant(tenantId: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>("/api/auth/active-tenant", {
    method: "POST",
    body: { tenantId },
  });
}
