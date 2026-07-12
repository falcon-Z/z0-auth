import type { BunRequest } from "bun";

import { randomToken } from "./crypto";
import { problem } from "./http";
import { ErrorCodes } from "@z0/contracts/errors";
import { CSRF_COOKIE, CSRF_HEADER } from "@z0/contracts/http";
import { safeDecodeURIComponent } from "@z0/contracts/validation";

export { CSRF_COOKIE, CSRF_HEADER };

export function createCsrfToken(): string {
  return randomToken(16);
}

export function parseCookies(req: Request): Map<string, string> {
  const header = req.headers.get("cookie") ?? "";
  const map = new Map<string, string>();
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) continue;
    const decoded = safeDecodeURIComponent(rest.join("="));
    if (decoded !== null) map.set(rawKey, decoded);
  }
  return map;
}

export function csrfCookieHeader(token: string, secure: boolean): string {
  const parts = [
    `${CSRF_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function validateOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!host) return false;

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      return originHost === host;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      return refererHost === host;
    } catch {
      return false;
    }
  }

  return false;
}

function csrfTokensMatch(req: Request, submittedToken: string | undefined): boolean {
  if (!submittedToken) return false;
  const cookieToken = parseCookies(req).get(CSRF_COOKIE);
  return Boolean(cookieToken && cookieToken === submittedToken);
}

/** JSON/API: requires X-CSRF-Token header matching cookie. */
export function validateCsrf(req: BunRequest): Response | null {
  if (!validateOrigin(req)) {
    return problem(403, "Forbidden", "Invalid origin", {
      errors: [{ field: "_csrf", code: ErrorCodes.CSRF_INVALID, message: "Invalid origin" }],
    });
  }

  const headerToken = req.headers.get(CSRF_HEADER);
  if (!csrfTokensMatch(req, headerToken ?? undefined)) {
    return problem(403, "Forbidden", "CSRF validation failed", {
      errors: [{ field: "_csrf", code: ErrorCodes.CSRF_INVALID, message: "CSRF token mismatch" }],
    });
  }

  return null;
}

/** HTML forms: hidden `_csrf` field matching cookie. */
export function validateFormCsrf(req: BunRequest, submittedToken: string | undefined): Response | null {
  if (!validateOrigin(req)) {
    return problem(403, "Forbidden", "Invalid origin", {
      errors: [{ field: "_csrf", code: ErrorCodes.CSRF_INVALID, message: "Invalid origin" }],
    });
  }

  if (!csrfTokensMatch(req, submittedToken)) {
    return problem(403, "Forbidden", "CSRF validation failed", {
      errors: [{ field: "_csrf", code: ErrorCodes.CSRF_INVALID, message: "CSRF token mismatch" }],
    });
  }

  return null;
}

export function ensureCsrfToken(req: Request): { token: string; setCookie: boolean } {
  const cookies = parseCookies(req);
  const existing = cookies.get(CSRF_COOKIE);
  if (existing) return { token: existing, setCookie: false };
  return { token: createCsrfToken(), setCookie: true };
}
