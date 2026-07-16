import type { ProblemDetail } from "@z0/contracts/errors";
import { CSRF_COOKIE, CSRF_HEADER } from "@z0/contracts/http";

export class ApiError extends Error {
  readonly problem: ProblemDetail;

  constructor(problem: ProblemDetail, message?: string) {
    super(message ?? problem.detail ?? problem.title);
    this.name = "ApiError";
    this.problem = problem;
  }
}

export type ApiFetchOptions = {
  method?: string;
  /** JSON body; sets Content-Type automatically. */
  body?: unknown;
  /** Attach X-CSRF-Token from the z0_csrf cookie (default for mutating methods). */
  csrf?: boolean;
  headers?: HeadersInit;
};

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

async function parseProblem(res: Response): Promise<ProblemDetail | null> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return null;
  try {
    return (await res.json()) as ProblemDetail;
  } catch {
    return null;
  }
}

function wantsCsrf(method: string, explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return method !== "GET" && method !== "HEAD";
}

/**
 * JSON API fetch with session cookies and optional CSRF.
 * Throws {@link ApiError} when the response is not ok and the body matches problem+json.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  return apiFetchInternal<T>(path, options, true);
}

async function apiFetchInternal<T>(path: string, options: ApiFetchOptions, allowStepUp: boolean): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (wantsCsrf(method, options.csrf)) {
    const csrf = await ensureCsrfCookie();
    headers.set(CSRF_HEADER, csrf);
  }

  const res = await fetch(path, {
    method,
    credentials: "include",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return undefined as T;
    return (await res.json()) as T;
  }

  const problem = await parseProblem(res);
  if (problem) {
    const stepUpRequired = problem.errors?.some((error) => error.code === "mfa_step_up_required");
    if (allowStepUp && stepUpRequired && path !== "/api/auth/mfa/step-up") {
      const passkeys = await apiFetchInternal<{ passkeys: unknown[] }>("/api/auth/passkeys", { method: "GET" }, false).catch(() => ({ passkeys: [] }));
      if (passkeys.passkeys.length > 0 && window.confirm("Use a passkey to verify this action? Choose Cancel to enter an authenticator or recovery code.")) {
        const { stepUpWithPasskey } = await import("./passkeys-api");
        await stepUpWithPasskey();
        return apiFetchInternal<T>(path, options, false);
      }
      const code = window.prompt("Enter an authentication or recovery code to continue:");
      if (code?.trim()) {
        await apiFetchInternal("/api/auth/mfa/step-up", { method: "POST", body: { code } }, false);
        return apiFetchInternal<T>(path, options, false);
      }
    }
    const passkeyStepUpRequired = problem.errors?.some((error) => error.code === "passkey_step_up_required");
    if (allowStepUp && passkeyStepUpRequired && !path.includes("/api/auth/passkeys/")) {
      const { stepUpWithPasskey } = await import("./passkeys-api");
      await stepUpWithPasskey();
      return apiFetchInternal<T>(path, options, false);
    }
    throw new ApiError(problem);
  }
  throw new Error(`${method} ${path} failed (${res.status})`);
}
