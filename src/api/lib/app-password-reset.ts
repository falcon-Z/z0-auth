import type { BunRequest } from "bun";

import type { ForgotPasswordRequest, ResetPasswordRequest } from "@z0/contracts/email-settings";
import { ErrorCodes } from "@z0/contracts/errors";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@z0/contracts/password-policy";
import { normalizeEmail, validateEmail, validateRequiredString } from "@z0/contracts/validation";

import { findAppByClientId, findAppIdByClientId } from "./auth-realm";
import { getDb } from "./db";
import { problem } from "./http";
import { signResetToken, verifyResetToken } from "./instance-keys";
import { deliverEmail } from "./smtp-mail";
import { hashPassword } from "./password";
import { isSmtpReady } from "./smtp-settings";
import { checkRateLimit, clientIp } from "./rate-limit";
import { revokeAllAppUserSessions } from "./app-session";
import { revokeAllOAuthTokensForAppUser, revokePendingAuthorizationCodesForAppUser } from "./oauth";
import { requestPublicOrigin } from "./config";

const RESET_TTL_MS = 60 * 60 * 1000;
const GENERIC_MESSAGE = "If an account exists for that email, you will receive a reset link shortly.";

function resetUrlFromRequest(req: Request, token: string, clientId: string): string {
  const segment = encodeURIComponent(token);
  return `${requestPublicOrigin(req)}/auth/reset-password/${segment}?client_id=${encodeURIComponent(clientId)}`;
}

async function findAppUserIdByEmail(appId: string, email: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  const [row] = await getDb()`
    SELECT id FROM app_users
    WHERE app_id = ${appId}
      AND lower(email) = ${normalized}
      AND disabled_at IS NULL
      AND deleted_at IS NULL
    LIMIT 1
  `;
  return row ? String((row as { id: string }).id) : null;
}

export async function requestAppPasswordReset(
  req: BunRequest,
  body: ForgotPasswordRequest,
): Promise<Response> {
  if (!(await isSmtpReady())) {
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

  const clientId = body.clientId?.trim() ?? "";
  if (!clientId) {
    return problem(400, "Validation Error", "Invalid request.", {
      errors: [{ field: "clientId", code: ErrorCodes.REQUIRED, message: "Client id is required" }],
    });
  }

  const requiredErrors = validateRequiredString(body.email, "email", "Email");
  if (requiredErrors.length) {
    return problem(400, "Validation Error", "Invalid request.", { errors: requiredErrors });
  }
  const email = normalizeEmail(String(body.email));
  const emailErrors = validateEmail(email);
  if (emailErrors.length) {
    return problem(400, "Validation Error", "Invalid request.", { errors: emailErrors });
  }

  const ip = clientIp(req);
  const ipLimit = await checkRateLimit({ key: `app-reset:ip:${ip}`, limit: 10, windowMs: 15 * 60 * 1000 });
  if (!ipLimit.allowed) {
    return problem(429, "Too Many Requests", "Too many reset attempts. Try again later.", {
      code: ErrorCodes.RATE_LIMITED,
      retryAfter: ipLimit.retryAfterSec,
      errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Too many attempts" }],
    });
  }

  const match = await findAppByClientId(clientId);
  const emailLimitKey = match ? `app-reset:email:${match.app_id}:${email}` : `app-reset:email:unknown:${email}`;
  const emailLimit = await checkRateLimit({
    key: emailLimitKey,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!emailLimit.allowed) {
    return problem(429, "Too Many Requests", "Too many reset attempts. Try again later.", {
      code: ErrorCodes.RATE_LIMITED,
      retryAfter: emailLimit.retryAfterSec,
      errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Too many attempts" }],
    });
  }

  if (!match || match.app_status !== "active") {
    return new Response(JSON.stringify({ ok: true, message: GENERIC_MESSAGE }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const appUserId = await findAppUserIdByEmail(match.app_id, email);
  if (appUserId) {
    const jti = crypto.randomUUID();
    const exp = Math.floor((Date.now() + RESET_TTL_MS) / 1000);
    const signedToken = await signResetToken({
      v: 1,
      uid: appUserId,
      exp,
      jti,
      realm: "app",
      aid: match.app_id,
    });
    const expiresAt = new Date(exp * 1000);

    await getDb()`
      UPDATE app_password_reset_tokens
      SET used_at = NOW()
      WHERE app_user_id = ${appUserId}
        AND used_at IS NULL
        AND expires_at > NOW()
    `;

    await getDb()`
      INSERT INTO app_password_reset_tokens (app_user_id, app_id, token_hash, expires_at)
      VALUES (${appUserId}, ${match.app_id}, ${jti}, ${expiresAt})
    `;

    const link = resetUrlFromRequest(req, signedToken, clientId);
    const appName = match.app_name;
    await deliverEmail({
      to: email,
      subject: `Reset your ${appName} password`,
      text: [
        `You requested a password reset for ${appName}.`,
        "",
        `Open this link to choose a new password (expires in 1 hour):`,
        link,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    });
  }

  return new Response(JSON.stringify({ ok: true, message: GENERIC_MESSAGE }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function findPendingAppResetByJti(jti: string): Promise<{
  id: string;
  app_user_id: string;
  app_id: string;
  expires_at: Date;
  used_at: Date | null;
} | null> {
  const [row] = await getDb()`
    SELECT id, app_user_id, app_id, expires_at, used_at
    FROM app_password_reset_tokens
    WHERE token_hash = ${jti}
  `;
  if (!row) return null;
  const r = row as {
    id: string;
    app_user_id: string;
    app_id: string;
    expires_at: Date;
    used_at: Date | null;
  };
  return {
    ...r,
    id: String(r.id),
    app_user_id: String(r.app_user_id),
    app_id: String(r.app_id),
    expires_at: new Date(r.expires_at),
    used_at: r.used_at ? new Date(r.used_at) : null,
  };
}

export async function completeAppPasswordReset(
  req: BunRequest,
  body: ResetPasswordRequest,
  clientId?: string,
): Promise<Response> {
  const ip = clientIp(req);
  const ipLimit = await checkRateLimit({
    key: `app-reset-complete:ip:${ip}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!ipLimit.allowed) {
    return problem(429, "Too Many Requests", "Too many attempts. Try again later.", {
      code: ErrorCodes.RATE_LIMITED,
      retryAfter: ipLimit.retryAfterSec,
      errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Too many attempts" }],
    });
  }

  if (!(await isSmtpReady())) {
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

  const token = body.token?.trim() ?? "";
  if (!token) {
    return problem(400, "Validation Error", "Invalid reset link.", {
      errors: [{ field: "token", code: ErrorCodes.REQUIRED, message: "Reset token is required" }],
    });
  }

  const verified = await verifyResetToken(token);
  if (!verified.ok || verified.payload.realm !== "app") {
    return invalidResetTokenResponse();
  }

  const { payload } = verified;
  if (payload.exp * 1000 < Date.now()) {
    return invalidResetTokenResponse();
  }

  const resolvedClientId = clientId?.trim();
  if (resolvedClientId) {
    const appIdForClient = await findAppIdByClientId(resolvedClientId);
    if (!appIdForClient || appIdForClient !== payload.aid) {
      return invalidResetTokenResponse();
    }
  }

  const [appRow] = await getDb()`
    SELECT status FROM apps WHERE id = ${payload.aid} LIMIT 1
  `;
  if (!appRow || (appRow as { status: string }).status !== "active") {
    return invalidResetTokenResponse();
  }

  const row = await findPendingAppResetByJti(payload.jti);
  if (!row || row.used_at || row.app_user_id !== payload.uid || row.app_id !== payload.aid) {
    return invalidResetTokenResponse();
  }

  if (row.expires_at.getTime() < Date.now()) {
    return invalidResetTokenResponse();
  }

  const [userRow] = await getDb()`
    SELECT email, name FROM app_users
    WHERE id = ${row.app_user_id} AND app_id = ${row.app_id}
      AND disabled_at IS NULL AND deleted_at IS NULL
  `;
  if (!userRow) return invalidResetTokenResponse();
  const passwordErrors = validatePassword(body.password ?? "", {
    email: String((userRow as { email: string }).email),
    name: String((userRow as { name: string }).name),
  });
  const confirmErrors = validatePasswordConfirm(body.password ?? "", body.passwordConfirm ?? "");
  const errors = [...passwordErrors, ...confirmErrors];
  if (errors.length) return problem(400, "Validation Error", "Password does not meet requirements.", { errors });

  const passwordHash = await hashPassword(body.password);

  try {
    const completed = await getDb().begin(async (tx) => {
      const [consumed] = await tx`
        UPDATE app_password_reset_tokens
        SET used_at = NOW()
        WHERE id = ${row.id}
          AND app_user_id = ${row.app_user_id}
          AND app_id = ${row.app_id}
          AND used_at IS NULL
          AND expires_at > NOW()
        RETURNING id
      `;
      if (!consumed) return false;

      const [updated] = await tx`
        UPDATE app_users
        SET password_hash = ${passwordHash}, locked_until = NULL,
            failed_sign_in_count = 0, failed_sign_in_window_started_at = NULL, updated_at = NOW()
        WHERE id = ${row.app_user_id}
          AND app_id = ${row.app_id}
          AND disabled_at IS NULL
          AND deleted_at IS NULL
        RETURNING id
      `;
      if (!updated) {
        throw new Error("app_user_inactive");
      }
      return true;
    });
    if (!completed) return invalidResetTokenResponse();
  } catch (error) {
    if (error instanceof Error && error.message === "app_user_inactive") {
      return invalidResetTokenResponse();
    }
    throw error;
  }

  await revokeAllAppUserSessions(row.app_user_id);
  await revokePendingAuthorizationCodesForAppUser(row.app_user_id);
  await revokeAllOAuthTokensForAppUser(row.app_user_id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function invalidResetTokenResponse(): Response {
  return problem(400, "Validation Error", "This reset link is invalid or has expired.", {
    errors: [
      {
        field: "token",
        code: ErrorCodes.RESET_TOKEN_INVALID,
        message: "This reset link is invalid or has expired",
      },
    ],
  });
}
