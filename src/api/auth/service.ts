import type { BunRequest } from "bun";

import { ErrorCodes } from "@z0/contracts/errors";
import { normalizeEmail, validateEmail } from "@z0/contracts/validation";

import { parseCookies } from "../lib/csrf";
import { getDb } from "../lib/db";
import { problem } from "../lib/http";
import { verifyPassword } from "../lib/password";
import { clientIp, isRateLimited, recordRateLimitHit } from "../lib/rate-limit";
import { writeAuditEvent } from "../lib/audit";
import {
  insertSession,
  prepareSession,
  revokeSessionByToken,
  sessionCookieHeader,
  SESSION_COOKIE,
} from "../lib/session";
import {
  accountCanAuthenticate,
  finalizeConsolePasswordSignIn,
  recordConsolePasswordFailure,
} from "../lib/account-lifecycle";
import { acceptConsoleRememberedBrowser, createConsoleMfaChallenge, hasConsoleMfa } from "../lib/mfa";

export type LoginResult =
  | { ok: true; mfaRequired: false; setCookie: string; rememberedBrowserCookie?: string; userId: string }
  | { ok: true; mfaRequired: true; setCookie: string; userId: string; challengeExpiresAt: Date }
  | { ok: false; response: Response; fieldErrors?: { field: string; message: string }[] };

export async function runLogin(
  req: BunRequest,
  emailRaw: string,
  password: string,
  returnPath?: string | null,
): Promise<LoginResult> {
  const rateConfig = {
    key: `login:${clientIp(req)}:${normalizeEmail(emailRaw)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  };
  const rate = await isRateLimited(rateConfig);
  if (rate.limited) {
    return {
      ok: false,
      response: problem(429, "Too Many Requests", "Too many login attempts", {
        errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Rate limit exceeded" }],
      }),
    };
  }

  const emailErrors = validateEmail(emailRaw);
  if (emailErrors.length > 0) {
    await recordRateLimitHit(rateConfig);
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", { errors: emailErrors }),
      fieldErrors: emailErrors.map((e) => ({ field: e.field, message: e.message })),
    };
  }

  const email = normalizeEmail(emailRaw);
  const invalidMessage = "Invalid email or password";

  const [row] = await getDb()`
    SELECT u.id, pc.password_hash, u.disabled_at, u.locked_until, u.deleted_at
    FROM users u
    JOIN password_credentials pc ON pc.user_id = u.id
    WHERE lower(u.email) = ${email}
  `;

  if (!row) {
    await recordRateLimitHit(rateConfig);
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

  const user = row as {
    id: string;
    password_hash: string;
    disabled_at: Date | null;
    locked_until: Date | null;
    deleted_at: Date | null;
  };
  if (!accountCanAuthenticate(user)) {
    await recordRateLimitHit(rateConfig);
    await writeAuditEvent({
      action: "auth.login_failed",
      resourceType: "auth",
      payload: { audience: "console", reason: "unavailable_account" },
    });
    return {
      ok: false,
      response: problem(401, "Unauthorized", invalidMessage, {
        errors: [{ field: "_auth", code: ErrorCodes.INVALID_CREDENTIALS, message: invalidMessage }],
      }),
      fieldErrors: [{ field: "_auth", message: invalidMessage }],
    };
  }
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await recordRateLimitHit(rateConfig);
    await recordConsolePasswordFailure(String(user.id));
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
  let rememberedBrowserCookie: string | undefined;
  if (await hasConsoleMfa(userId)) {
    const remembered = await acceptConsoleRememberedBrowser(req, userId);
    rememberedBrowserCookie = remembered.setCookie;
    if (remembered.reuseDetected) {
      await writeAuditEvent({ actorUserId: userId, action: "mfa.remembered_browser_reuse_detected", resourceType: "console_member", resourceId: userId, payload: { realm: "console" } });
    }
    if (!remembered.accepted) {
    const stillAvailable = await finalizeConsolePasswordSignIn(userId, async () => true);
    if (!stillAvailable) {
      await recordRateLimitHit(rateConfig);
      return {
        ok: false,
        response: problem(401, "Unauthorized", invalidMessage, {
          errors: [{ field: "_auth", code: ErrorCodes.INVALID_CREDENTIALS, message: invalidMessage }],
        }),
        fieldErrors: [{ field: "_auth", message: invalidMessage }],
      };
    }
    const challenge = await createConsoleMfaChallenge(req, userId, "password", returnPath);
    return {
      ok: true,
      mfaRequired: true,
      setCookie: challenge.setCookie,
      userId,
      challengeExpiresAt: challenge.expiresAt,
    };
    }
  }
  const preparedSession = await prepareSession(req);
  const existingToken = parseCookies(req).get(SESSION_COOKIE);
  if (existingToken) await revokeSessionByToken(existingToken);
  const session = await finalizeConsolePasswordSignIn(
    userId,
    (tx) => insertSession(tx, userId, preparedSession, {
      authenticationMethod: rememberedBrowserCookie ? "password+remembered_browser" : "password",
    }),
  );
  if (!session) {
    await recordRateLimitHit(rateConfig);
    await writeAuditEvent({
      action: "auth.login_failed",
      resourceType: "auth",
      payload: { audience: "console", reason: "unavailable_account" },
    });
    return {
      ok: false,
      response: problem(401, "Unauthorized", invalidMessage, {
        errors: [{ field: "_auth", code: ErrorCodes.INVALID_CREDENTIALS, message: invalidMessage }],
      }),
      fieldErrors: [{ field: "_auth", message: invalidMessage }],
    };
  }

  await writeAuditEvent({
    actorUserId: userId,
    action: "auth.login_succeeded",
    resourceType: "auth",
    payload: { audience: "console" },
  });

  return { ok: true, mfaRequired: false, setCookie: sessionCookieHeader(session.token, session.expiresAt), rememberedBrowserCookie, userId };
}
