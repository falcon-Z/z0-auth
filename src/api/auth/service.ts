import type { BunRequest } from "bun";

import { ErrorCodes } from "@z0/contracts/errors";
import { normalizeEmail, validateEmail } from "@z0/contracts/validation";

import { parseCookies } from "../lib/csrf";
import { getDb } from "../lib/db";
import { problem } from "../lib/http";
import { verifyPassword } from "../lib/password";
import { checkRateLimit, clientIp } from "../lib/rate-limit";
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

  const [user] = await getDb()`
    SELECT id, password_hash FROM users WHERE lower(email) = ${email} AND status = 'active'
  `;

  if (!user) {
    return {
      ok: false,
      response: problem(401, "Unauthorized", invalidMessage, {
        errors: [{ field: "_auth", code: ErrorCodes.INVALID_CREDENTIALS, message: invalidMessage }],
      }),
      fieldErrors: [{ field: "_auth", message: invalidMessage }],
    };
  }

  const valid = await verifyPassword(password, (user as { password_hash: string }).password_hash);
  if (!valid) {
    return {
      ok: false,
      response: problem(401, "Unauthorized", invalidMessage, {
        errors: [{ field: "_auth", code: ErrorCodes.INVALID_CREDENTIALS, message: invalidMessage }],
      }),
      fieldErrors: [{ field: "_auth", message: invalidMessage }],
    };
  }

  const userId = String((user as { id: string }).id);
  const existingToken = parseCookies(req).get(SESSION_COOKIE);
  if (existingToken) await revokeSessionByToken(existingToken);

  const { token, expiresAt } = await createSession(userId, req);
  return { ok: true, setCookie: sessionCookieHeader(token, expiresAt), userId };
}
