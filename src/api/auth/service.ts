import type { BunRequest } from "bun";

import { ErrorCodes } from "@z0/contracts/errors";
import { normalizeEmail, validateEmail } from "@z0/contracts/validation";

import { parseCookies } from "../lib/csrf";
import { getDb } from "../lib/db";
import { problem } from "../lib/http";
import { verifyPassword } from "../lib/password";
import { checkRateLimit, clientIp } from "../lib/rate-limit";
import { writeAuditEvent } from "../lib/audit";
import {
  createSession,
  revokeSessionByToken,
  sessionCookieHeader,
  SESSION_COOKIE,
} from "../lib/session";

export type LoginResult =
  | { ok: true; setCookie: string; userId: string }
  | { ok: false; response: Response; fieldErrors?: { field: string; message: string }[] };

export async function runLogin(
  req: BunRequest,
  emailRaw: string,
  password: string,
): Promise<LoginResult> {
  const rate = checkRateLimit({
    key: `login:${clientIp(req)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) {
    return {
      ok: false,
      response: problem(429, "Too Many Requests", "Too many login attempts", {
        errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Rate limit exceeded" }],
      }),
    };
  }

  const emailErrors = validateEmail(emailRaw);
  if (emailErrors.length > 0) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", { errors: emailErrors }),
      fieldErrors: emailErrors.map((e) => ({ field: e.field, message: e.message })),
    };
  }

  const email = normalizeEmail(emailRaw);
  const invalidMessage = "Invalid email or password";

  const [row] = await getDb()`
    SELECT u.id, pc.password_hash
    FROM users u
    JOIN password_credentials pc ON pc.user_id = u.id
    WHERE lower(u.email) = ${email} AND u.status = 'active'
  `;

  if (!row) {
    await writeAuditEvent({
      action: "auth.login_failed",
      resourceType: "auth",
      payload: { audience: "console", reason: "unknown_user" },
    });
    return {
      ok: false,
      response: problem(401, "Unauthorized", invalidMessage, {
        errors: [{ field: "_auth", code: ErrorCodes.INVALID_CREDENTIALS, message: invalidMessage }],
      }),
      fieldErrors: [{ field: "_auth", message: invalidMessage }],
    };
  }

  const user = row as { id: string; password_hash: string };
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await writeAuditEvent({
      actorUserId: String(user.id),
      action: "auth.login_failed",
      resourceType: "auth",
      payload: { audience: "console", reason: "invalid_password" },
    });
    return {
      ok: false,
      response: problem(401, "Unauthorized", invalidMessage, {
        errors: [{ field: "_auth", code: ErrorCodes.INVALID_CREDENTIALS, message: invalidMessage }],
      }),
      fieldErrors: [{ field: "_auth", message: invalidMessage }],
    };
  }

  const userId = String(user.id);
  const existingToken = parseCookies(req).get(SESSION_COOKIE);
  if (existingToken) await revokeSessionByToken(existingToken);

  const { token, expiresAt } = await createSession(userId, req);

  await writeAuditEvent({
    actorUserId: userId,
    action: "auth.login_succeeded",
    resourceType: "auth",
    payload: { audience: "console" },
  });

  return { ok: true, setCookie: sessionCookieHeader(token, expiresAt), userId };
}
