import type { BunRequest } from "bun";

import { ErrorCodes } from "@z0/contracts/errors";
import type { EmailDeliveryStatus } from "@z0/contracts/email-delivery";
import { normalizeEmail, validateEmail } from "@z0/contracts/validation";

import { accountCanAuthenticate } from "./account-lifecycle";
import { writeAuditEvent } from "./audit";
import { findActiveOAuthClient } from "./oauth";
import { randomToken, sha256Hex } from "./crypto";
import { getDb } from "./db";
import { problem } from "./http";
import { checkRateLimit, clientIp } from "./rate-limit";
import { requestPublicOrigin } from "./config";
import { isSmtpReady } from "./smtp-settings";
import { sendTransactionalEmail } from "./transactional-email";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const GENERIC_VERIFICATION_MESSAGE = "If an unverified account exists, a verification email will be sent shortly.";

export async function issueAppEmailVerification(
  req: Request,
  appUserId: string,
  actorUserId?: string | null,
): Promise<{ status: EmailDeliveryStatus; alreadyVerified?: boolean }> {
  if (!(await isSmtpReady())) return { status: "skipped" };
  const rawToken = randomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
  const outcome = await getDb().begin(async (tx) => {
    const [row] = await tx`
      SELECT u.id, u.app_id, u.email, u.name, u.email_verified_at,
             u.disabled_at, u.locked_until, u.deleted_at, a.name AS app_name
      FROM app_users u
      JOIN apps a ON a.id = u.app_id
      WHERE u.id = ${appUserId} AND a.status = 'active'
      FOR UPDATE OF u
    `;
    if (!row) return { state: "skipped" as const };
    const user = row as {
      id: string;
      app_id: string;
      email: string;
      name: string;
      email_verified_at: Date | null;
      disabled_at: Date | null;
      locked_until: Date | null;
      deleted_at: Date | null;
      app_name: string;
    };
    if (user.email_verified_at) return { state: "verified" as const };
    if (!accountCanAuthenticate(user)) return { state: "skipped" as const };
    await tx`UPDATE app_email_verification_tokens SET used_at = NOW() WHERE app_user_id = ${appUserId} AND used_at IS NULL`;
    await tx`
      INSERT INTO app_email_verification_tokens (app_user_id, app_id, token_hash, expires_at)
      VALUES (${appUserId}, ${String(user.app_id)}, ${tokenHash}, ${expiresAt})
    `;
    await writeAuditEvent({
      actorUserId: actorUserId ?? null,
      action: "app_user.email_verification_requested",
      resourceType: "app_user",
      resourceId: appUserId,
      payload: { appId: String(user.app_id) },
    }, tx);
    return { state: "issued" as const, user };
  });
  if (outcome.state === "verified") return { status: "skipped", alreadyVerified: true };
  if (outcome.state === "skipped") return { status: "skipped" };
  const user = outcome.user;

  const link = `${requestPublicOrigin(req)}/auth/verify-email/${encodeURIComponent(rawToken)}`;
  return sendTransactionalEmail({
    to: user.email,
    subject: `Verify your email for ${user.app_name}`,
    text: [
      `Hi ${user.name},`,
      "",
      `Verify your email for ${user.app_name} by opening this link within 24 hours:`,
      link,
      "",
      "If you did not create this account, you can ignore this email.",
    ].join("\n"),
  });
}

export async function requestAppEmailVerification(
  req: BunRequest,
  clientId: string,
  emailRaw: string,
): Promise<Response> {
  const ip = clientIp(req);
  const ipLimit = await checkRateLimit({ key: `verify-email:ip:${ip}`, limit: 10, windowMs: 15 * 60 * 1000 });
  if (!ipLimit.allowed) return problem(429, "Too Many Requests", "Too many attempts. Try again later.", {
    code: ErrorCodes.RATE_LIMITED,
    retryAfter: ipLimit.retryAfterSec,
  });
  const email = normalizeEmail(emailRaw);
  if (validateEmail(email).length === 0) {
    const client = await findActiveOAuthClient(clientId.trim());
    const accountLimit = await checkRateLimit({
      key: `verify-email:account:${client?.appId ?? "unknown"}:${email}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!accountLimit.allowed) return problem(429, "Too Many Requests", "Too many attempts. Try again later.", {
      code: ErrorCodes.RATE_LIMITED,
      retryAfter: accountLimit.retryAfterSec,
    });
    if (client) {
      const [row] = await getDb()`
        SELECT id FROM app_users
        WHERE app_id = ${client.appId} AND lower(email) = ${email}
          AND email_verified_at IS NULL AND disabled_at IS NULL AND deleted_at IS NULL
      `;
      if (row) await issueAppEmailVerification(req, String((row as { id: string }).id));
    }
  }
  return new Response(JSON.stringify({ ok: true, message: GENERIC_VERIFICATION_MESSAGE }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function previewAppEmailVerification(rawToken: string): Promise<{ valid: boolean; appName?: string }> {
  const tokenHash = await sha256Hex(rawToken);
  const [row] = await getDb()`
    SELECT a.name AS app_name
    FROM app_email_verification_tokens t
    JOIN app_users u ON u.id = t.app_user_id AND u.app_id = t.app_id
    JOIN apps a ON a.id = t.app_id
    WHERE t.token_hash = ${tokenHash} AND t.used_at IS NULL AND t.expires_at > NOW()
      AND u.email_verified_at IS NULL AND u.disabled_at IS NULL AND u.deleted_at IS NULL
      AND a.status = 'active'
  `;
  return row ? { valid: true, appName: String((row as { app_name: string }).app_name) } : { valid: false };
}

export async function completeAppEmailVerification(rawToken: string): Promise<{ ok: true; appName: string } | { ok: false; response: Response }> {
  const tokenHash = await sha256Hex(rawToken);
  const result = await getDb().begin(async (tx) => {
    const [row] = await tx`
      SELECT t.id, t.app_user_id, t.app_id, t.expires_at, t.used_at, a.name AS app_name,
             u.email_verified_at, u.disabled_at, u.deleted_at
      FROM app_email_verification_tokens t
      JOIN app_users u ON u.id = t.app_user_id AND u.app_id = t.app_id
      JOIN apps a ON a.id = t.app_id
      WHERE t.token_hash = ${tokenHash}
      FOR UPDATE OF t, u
    `;
    if (!row) return null;
    const value = row as {
      id: string;
      app_user_id: string;
      app_id: string;
      expires_at: Date;
      used_at: Date | null;
      app_name: string;
      email_verified_at: Date | null;
      disabled_at: Date | null;
      deleted_at: Date | null;
    };
    if (value.used_at || new Date(value.expires_at).getTime() <= Date.now() || value.disabled_at || value.deleted_at) return null;
    await tx`UPDATE app_email_verification_tokens SET used_at = NOW() WHERE id = ${String(value.id)}`;
    await tx`UPDATE app_users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = ${String(value.app_user_id)}`;
    await writeAuditEvent({
      action: "app_user.email_verified",
      resourceType: "app_user",
      resourceId: String(value.app_user_id),
      payload: { appId: String(value.app_id) },
    }, tx);
    return { appName: value.app_name };
  });
  if (!result) return { ok: false, response: problem(400, "Invalid verification link", "This verification link is invalid or has expired.", {
    errors: [{ field: "token", code: ErrorCodes.VERIFICATION_TOKEN_INVALID, message: "Request a new verification email" }],
  }) };
  return { ok: true, appName: result.appName };
}
