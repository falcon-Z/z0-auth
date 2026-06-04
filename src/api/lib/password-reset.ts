import type { BunRequest } from "bun";

import type { ForgotPasswordRequest, ResetPasswordRequest } from "@z0/contracts/email-settings";
import { ErrorCodes } from "@z0/contracts/errors";
import {
  validatePassword,
  validatePasswordConfirm,
} from "@z0/contracts/password-policy";
import { normalizeEmail, validateEmail, validateRequiredString } from "@z0/contracts/validation";

import { writeAuditEvent } from "./audit";
import { getDb } from "./db";
import { problem } from "./http";
import { signResetToken, verifyResetToken } from "./instance-keys";
import { deliverEmail } from "./smtp-mail";
import { hashPassword } from "./password";
import { isSmtpReady } from "./smtp-settings";
import { checkRateLimit, clientIp } from "./rate-limit";
import { revokeAllUserSessions } from "./session";

const RESET_TTL_MS = 60 * 60 * 1000;
const GENERIC_MESSAGE = "If an account exists for that email, you will receive a reset link shortly.";

function resetUrlFromRequest(req: Request, token: string): string {
  const segment = encodeURIComponent(token);
  return `${new URL(req.url).origin}/auth/reset-password/${segment}`;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  const [row] = await getDb()`
    SELECT id FROM users WHERE lower(email) = ${normalized} AND status = 'active' LIMIT 1
  `;
  return row ? String((row as { id: string }).id) : null;
}

export async function requestPasswordReset(
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
  const ipLimit = checkRateLimit({ key: `reset:ip:${ip}`, limit: 10, windowMs: 15 * 60 * 1000 });
  if (!ipLimit.allowed) {
    return problem(429, "Too Many Requests", "Too many reset attempts. Try again later.", {
      code: ErrorCodes.RATE_LIMITED,
      retryAfter: ipLimit.retryAfterSec,
      errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Too many attempts" }],
    });
  }

  const emailLimit = checkRateLimit({ key: `reset:email:${email}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (!emailLimit.allowed) {
    return problem(429, "Too Many Requests", "Too many reset attempts. Try again later.", {
      code: ErrorCodes.RATE_LIMITED,
      retryAfter: emailLimit.retryAfterSec,
      errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Too many attempts" }],
    });
  }

  const userId = await findUserIdByEmail(email);
  if (userId) {
    const jti = crypto.randomUUID();
    const exp = Math.floor((Date.now() + RESET_TTL_MS) / 1000);
    const signedToken = await signResetToken({ v: 1, uid: userId, exp, jti });
    const expiresAt = new Date(exp * 1000);

    await getDb()`
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = ${userId}
        AND used_at IS NULL
        AND expires_at > NOW()
    `;

    await getDb()`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${userId}, ${jti}, ${expiresAt})
    `;

    const link = resetUrlFromRequest(req, signedToken);
    const appName = process.env.APP_NAME ?? "z0-auth";
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

    await writeAuditEvent({
      actorUserId: userId,
      action: "password_reset.requested",
      resourceType: "user",
      resourceId: userId,
    });
  }

  return new Response(JSON.stringify({ ok: true, message: GENERIC_MESSAGE }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function findPendingResetByJti(jti: string): Promise<{
  id: string;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
} | null> {
  const [row] = await getDb()`
    SELECT id, user_id, expires_at, used_at
    FROM password_reset_tokens
    WHERE token_hash = ${jti}
  `;
  if (!row) return null;
  const r = row as {
    id: string;
    user_id: string;
    expires_at: Date;
    used_at: Date | null;
  };
  return {
    ...r,
    id: String(r.id),
    user_id: String(r.user_id),
    expires_at: new Date(r.expires_at),
    used_at: r.used_at ? new Date(r.used_at) : null,
  };
}

export async function completePasswordReset(
  req: BunRequest,
  body: ResetPasswordRequest,
): Promise<Response> {
  const ip = clientIp(req);
  const ipLimit = checkRateLimit({ key: `reset-complete:ip:${ip}`, limit: 10, windowMs: 15 * 60 * 1000 });
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

  const passwordErrors = validatePassword(body.password ?? "");
  const confirmErrors = validatePasswordConfirm(body.password ?? "", body.passwordConfirm ?? "");
  const errors = [...passwordErrors, ...confirmErrors];
  if (errors.length) {
    return problem(400, "Validation Error", "Password does not meet requirements.", { errors });
  }

  const verified = await verifyResetToken(token);
  if (!verified.ok) {
    return invalidResetTokenResponse();
  }

  const { payload } = verified;
  if (payload.exp * 1000 < Date.now()) {
    return invalidResetTokenResponse();
  }

  const row = await findPendingResetByJti(payload.jti);
  if (!row || row.used_at || row.user_id !== payload.uid) {
    return invalidResetTokenResponse();
  }

  if (row.expires_at.getTime() < Date.now()) {
    return invalidResetTokenResponse();
  }

  const userId = row.user_id;
  const passwordHash = await hashPassword(body.password);

  await getDb().begin(async (tx) => {
    await tx`
      UPDATE password_credentials
      SET password_hash = ${passwordHash}, updated_at = NOW()
      WHERE user_id = ${userId}
    `;
    await tx`
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE id = ${row.id}
    `;
  });

  await revokeAllUserSessions(userId);
  await writeAuditEvent({
    actorUserId: userId,
    action: "password_reset.completed",
    resourceType: "user",
    resourceId: userId,
  });

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
