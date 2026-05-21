import type { BunRequest } from "bun";

import type { LoginRequest, ResetPasswordRequest } from "@shared/contracts/auth";
import { ErrorCodes } from "@shared/contracts/errors";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@shared/contracts/password-policy";
import { normalizeEmail, parseJsonBody, validateEmail, validateRequiredString } from "@shared/contracts/validation";

import { buildSessionResponse, getUserById, getUserRoles } from "../lib/auth";
import { getUserDefaultTenant } from "../lib/tenant";
import { validateCsrf, parseCookies } from "../lib/csrf";
import { getDb } from "../lib/db";
import { json, problem } from "../lib/http";
import { hashPassword, verifyPassword } from "../lib/password";
import { verifyRecoveryKey } from "../lib/recovery-key";
import { checkRateLimit, clientIp } from "../lib/rate-limit";
import {
  clearSessionCookieHeader,
  createSession,
  resolveSession,
  revokeAllUserSessions,
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

export async function handleResetPassword(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const rate = checkRateLimit({
    key: `reset:${clientIp(req)}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.allowed) {
    return problem(429, "Too Many Requests", "Too many reset attempts", {
      errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Rate limit exceeded" }],
    });
  }

  const parsed = await parseJsonBody<ResetPasswordRequest>(req);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body;
  const errors = [
    ...validateEmail(body.email),
    ...validateRequiredString(body.recoveryKey, "recoveryKey", "Recovery key"),
    ...validatePassword(body.newPassword ?? "", { email: body.email }),
    ...validatePasswordConfirm(body.newPassword ?? "", body.passwordConfirm ?? ""),
  ];
  if (errors.length > 0) {
    return problem(400, "Validation Error", "Invalid request", { errors });
  }

  const email = normalizeEmail(body.email);
  const generic = problem(400, "Bad Request", "Invalid email or recovery key", {
    errors: [{ field: "_auth", code: ErrorCodes.INVALID_CREDENTIALS, message: "Invalid email or recovery key" }],
  });

  const [user] = await getDb()`
    SELECT id FROM users WHERE lower(email) = ${email} AND status = 'active'
  `;
  if (!user) return generic;

  const userId = String((user as { id: string }).id);

  const [recovery] = await getDb()`
    SELECT key_hash FROM user_recovery_keys
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!recovery) return generic;

  const keyValid = await verifyRecoveryKey(body.recoveryKey, (recovery as { key_hash: string }).key_hash);
  if (!keyValid) return generic;

  const passwordHash = await hashPassword(body.newPassword);
  await getDb()`UPDATE users SET password_hash = ${passwordHash}, updated_at = NOW() WHERE id = ${userId}`;
  await revokeAllUserSessions(userId);

  console.info(JSON.stringify({ event: "auth.password_reset", userId }));
  return json({ ok: true });
}

export async function handleRegister(): Promise<Response> {
  return problem(403, "Forbidden", "Platform registration is disabled.");
}
