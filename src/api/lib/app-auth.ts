import type { BunRequest } from "bun";

import { ErrorCodes } from "@z0/contracts/errors";
import { normalizeEmail, validateEmail, validateRequiredString } from "@z0/contracts/validation";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@z0/contracts/password-policy";

import { getDb } from "./db";
import { problem } from "./http";
import { verifyPassword, hashPassword } from "./password";
import { checkRateLimit, clientIp } from "./rate-limit";
import {
  appSessionCookieHeader,
  createAppSession,
  readAppSessionToken,
  revokeAppSessionByToken,
} from "./app-session";

export type AppAuthResult =
  | { ok: true; setCookie: string; appUserId: string }
  | { ok: false; response: Response; fieldErrors?: { field: string; message: string }[] };

async function findAppUserForLogin(appId: string, email: string): Promise<{ id: string; password_hash: string } | null> {
  const [row] = await getDb()`
    SELECT id, password_hash
    FROM app_users
    WHERE app_id = ${appId}
      AND lower(email) = ${email}
      AND status = 'active'
  `;
  if (!row) return null;
  return {
    id: String((row as { id: string }).id),
    password_hash: (row as { password_hash: string }).password_hash,
  };
}

async function appUserExists(appId: string, email: string): Promise<boolean> {
  const [row] = await getDb()`
    SELECT 1
    FROM app_users
    WHERE app_id = ${appId}
      AND lower(email) = ${email}
    LIMIT 1
  `;
  return Boolean(row);
}

async function issueAppSession(
  req: BunRequest,
  appUserId: string,
  appId: string,
): Promise<{ setCookie: string; appUserId: string }> {
  const existingToken = readAppSessionToken(req);
  if (existingToken) await revokeAppSessionByToken(existingToken);

  const { token, expiresAt } = await createAppSession(appUserId, appId, req);
  return {
    setCookie: appSessionCookieHeader(token, expiresAt),
    appUserId,
  };
}

export async function runAppLogin(
  req: BunRequest,
  appId: string,
  emailRaw: string,
  password: string,
): Promise<AppAuthResult> {
  const rate = checkRateLimit({
    key: `app-login:${appId}:${clientIp(req)}`,
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

  const user = await findAppUserForLogin(appId, email);
  if (!user) {
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
    return {
      ok: false,
      response: problem(401, "Unauthorized", invalidMessage, {
        errors: [{ field: "_auth", code: ErrorCodes.INVALID_CREDENTIALS, message: invalidMessage }],
      }),
      fieldErrors: [{ field: "_auth", message: invalidMessage }],
    };
  }

  const session = await issueAppSession(req, user.id, appId);
  return { ok: true, setCookie: session.setCookie, appUserId: session.appUserId };
}

export async function runAppRegister(
  req: BunRequest,
  appId: string,
  emailRaw: string,
  nameRaw: string,
  password: string,
  passwordConfirm: string,
): Promise<AppAuthResult> {
  const rate = checkRateLimit({
    key: `app-register:${appId}:${clientIp(req)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) {
    return {
      ok: false,
      response: problem(429, "Too Many Requests", "Too many sign-up attempts", {
        errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Rate limit exceeded" }],
      }),
    };
  }

  const email = normalizeEmail(emailRaw);
  const name = nameRaw.trim();
  const errors = [
    ...validateEmail(emailRaw),
    ...validateRequiredString(nameRaw, "name", "Name"),
    ...validatePassword(password, { email, name }),
    ...validatePasswordConfirm(password, passwordConfirm),
  ];
  if (errors.length) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", { errors }),
      fieldErrors: errors.map((e) => ({ field: e.field, message: e.message })),
    };
  }

  if (await appUserExists(appId, email)) {
    return {
      ok: false,
      response: problem(409, "Conflict", "An account with this email already exists for this application.", {
        errors: [
          {
            field: "email",
            code: ErrorCodes.APP_USER_EXISTS,
            message: "Already registered for this application",
          },
        ],
      }),
      fieldErrors: [{ field: "email", message: "An account with this email already exists." }],
    };
  }

  const passwordHash = await hashPassword(password);

  try {
    const [inserted] = await getDb()`
      INSERT INTO app_users (app_id, email, name, password_hash, email_verified_at)
      VALUES (${appId}, ${email}, ${name}, ${passwordHash}, NOW())
      RETURNING id
    `;
    const appUserId = String((inserted as { id: string }).id);
    const session = await issueAppSession(req, appUserId, appId);
    return { ok: true, setCookie: session.setCookie, appUserId: session.appUserId };
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) {
      return {
        ok: false,
        response: problem(409, "Conflict", "An account with this email already exists for this application.", {
          errors: [
            {
              field: "email",
              code: ErrorCodes.APP_USER_EXISTS,
              message: "Already registered for this application",
            },
          ],
        }),
        fieldErrors: [{ field: "email", message: "An account with this email already exists." }],
      };
    }
    throw error;
  }
}

export async function runAppInviteAcceptSignIn(
  req: BunRequest,
  appId: string,
  appUserId: string,
): Promise<AppAuthResult> {
  const session = await issueAppSession(req, appUserId, appId);
  return { ok: true, setCookie: session.setCookie, appUserId: session.appUserId };
}
