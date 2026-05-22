import type { BunRequest } from "bun";

import type { LoginRequest } from "@shared/contracts/auth";
import { ErrorCodes } from "@shared/contracts/errors";
import { normalizeEmail, parseJsonBody, validateEmail } from "@shared/contracts/validation";

import { buildSessionResponse, getUserById, getUserRoles } from "../lib/auth";
import { getUserDefaultTenant } from "../lib/tenant";
import { validateCsrf, parseCookies } from "../lib/csrf";
import { getDb } from "../lib/db";
import { json, problem } from "../lib/http";
import { verifyPassword } from "../lib/password";
import { checkRateLimit, clientIp } from "../lib/rate-limit";
import {
  clearSessionCookieHeader,
  createSession,
  resolveSession,
  revokeSessionByToken,
  sessionCookieHeader,
  SESSION_COOKIE,
} from "../lib/session";
export async function handleLogin(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const rate = checkRateLimit({
    key: `login:${clientIp(req)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) {
    return problem(429, "Too Many Requests", "Too many login attempts", {
      errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Rate limit exceeded" }],
    });
  }

  const parsed = await parseJsonBody<LoginRequest>(req);
  if (!parsed.ok) return parsed.response;

  const emailErrors = validateEmail(parsed.body.email);
  if (emailErrors.length > 0) {
    return problem(400, "Validation Error", "Invalid request", { errors: emailErrors });
  }

  const email = normalizeEmail(parsed.body.email);
  const password = parsed.body.password ?? "";

  const [user] = await getDb()`
    SELECT id, password_hash FROM users WHERE lower(email) = ${email} AND status = 'active'
  `;

  const invalid = problem(401, "Unauthorized", "Invalid email or password", {
    errors: [{ field: "_auth", code: ErrorCodes.INVALID_CREDENTIALS, message: "Invalid email or password" }],
  });

  if (!user) return invalid;

  const valid = await verifyPassword(password, (user as { password_hash: string }).password_hash);
  if (!valid) return invalid;

  const userId = String((user as { id: string }).id);

  const existingToken = parseCookies(req).get(SESSION_COOKIE);
  if (existingToken) await revokeSessionByToken(existingToken);

  const { token, expiresAt } = await createSession(userId, req);
  const sessionUser = await getUserById(userId);
  const roles = await getUserRoles(userId);
  const tenant = await getUserDefaultTenant(userId);
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.set("Set-Cookie", sessionCookieHeader(token, expiresAt));

  return new Response(
    JSON.stringify({
      authenticated: true,
      user: sessionUser,
      roles,
      ...(tenant ? { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } } : {}),
    }),
    {
      status: 200,
      headers,
    },
  );
}

export async function handleLogout(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const token = parseCookies(req).get(SESSION_COOKIE);
  if (token) await revokeSessionByToken(token);

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Set-Cookie", clearSessionCookieHeader());
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export async function handleSession(req: BunRequest): Promise<Response> {
  const session = await buildSessionResponse(req);
  return json(session);
}

export async function handlePasswordResetUnavailable(): Promise<Response> {
  return problem(
    503,
    "Service Unavailable",
    "Password reset is not available until email (SMTP) is configured.",
    {
      errors: [
        {
          field: "_reset",
          code: ErrorCodes.PASSWORD_RESET_UNAVAILABLE,
          message: "Password reset is not available until email (SMTP) is configured.",
        },
      ],
    },
  );
}

export async function handleRegister(): Promise<Response> {
  return problem(403, "Forbidden", "Platform registration is disabled.");
}
