import type { SessionResponse } from "@z0/contracts/auth";
import { ErrorCodes } from "@z0/contracts/errors";

import { fetchWithTimeout, withTimeout } from "./fetch-with-timeout";
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
  try {
    return await withTimeout(async () => {
      let res: Response;
      try {
        res = await fetchWithTimeout("/api/auth/session", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
      } catch {
        return { kind: "unavailable" } as const;
      }

      if (res.status === 503) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        if (body.code === ErrorCodes.DATABASE_UNAVAILABLE) return { kind: "unavailable" } as const;
        return { kind: "setup" } as const;
      }
      if (!res.ok) return { kind: "login" } as const;

      try {
        const session = (await res.json()) as SessionResponse;
        if (!session.authenticated) return { kind: "login" } as const;
        return { kind: "authenticated", session };
      } catch {
        return { kind: "unavailable" } as const;
      }
    }, undefined, "Session load");
  } catch {
    return { kind: "unavailable" };
  }
}

export async function postLogout(): Promise<void> {
  await apiFetch<void>("/api/auth/logout", { method: "POST" });
}

