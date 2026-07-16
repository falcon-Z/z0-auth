import { ErrorCodes } from "@z0/contracts/errors";

import { writeAuditEvent } from "./audit";
import { requestPublicOrigin } from "./config";
import { getDb } from "./db";
import { problem } from "./http";
import { signResetToken } from "./instance-keys";
import { isSmtpReady } from "./smtp-settings";
import { deliverEmail } from "./smtp-mail";

const RESET_TTL_MS = 60 * 60 * 1000;

function unavailable(): Response {
  return problem(503, "Service Unavailable", "Password reset is not available until email (SMTP) is configured.", {
    errors: [{ field: "_reset", code: ErrorCodes.PASSWORD_RESET_UNAVAILABLE, message: "Configure and verify email first" }],
  });
}

function stateConflict(): Response {
  return problem(409, "Conflict", "Enable or restore this account before sending a password reset.", {
    errors: [{ field: "status", code: ErrorCodes.ACCOUNT_STATE_CONFLICT, message: "Account is disabled or deleted" }],
  });
}

export async function issueConsoleAdminReset(req: Request, targetUserId: string, actorUserId: string): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!(await isSmtpReady())) return { ok: false, response: unavailable() };
  const jti = crypto.randomUUID();
  const exp = Math.floor((Date.now() + RESET_TTL_MS) / 1000);
  const signed = await signResetToken({ v: 1, uid: targetUserId, exp, jti });
  const outcome = await getDb().begin(async (tx) => {
    const [row] = await tx`
      SELECT u.email, u.name, u.disabled_at, u.deleted_at
      FROM users u JOIN instance_members m ON m.user_id = u.id
      WHERE u.id = ${targetUserId}
      FOR UPDATE OF u
    `;
    if (!row) return { error: "not_found" as const };
    const user = row as { email: string; name: string; disabled_at: Date | null; deleted_at: Date | null };
    if (user.disabled_at || user.deleted_at) return { error: "state" as const };
    await tx`UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ${targetUserId} AND used_at IS NULL`;
    await tx`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (${targetUserId}, ${jti}, ${new Date(exp * 1000)})`;
    await tx`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${targetUserId} AND revoked_at IS NULL`;
    await writeAuditEvent({ actorUserId, action: "console_member.password_reset_requested", resourceType: "console_member", resourceId: targetUserId }, tx);
    return { error: null, user };
  });
  if (outcome.error === "not_found") return { ok: false, response: problem(404, "Not Found", "Member not found") };
  if (outcome.error === "state") return { ok: false, response: stateConflict() };
  const user = outcome.user;
  const sent = await deliverEmail({
    to: user.email,
    subject: "Reset your console password",
    text: [`Hi ${user.name},`, "", "An administrator requested a password reset for your console account.", "", "Open this link within 1 hour:", `${requestPublicOrigin(req)}/auth/reset-password/${encodeURIComponent(signed)}`, "", "If you were not expecting this, contact your administrator."].join("\n"),
  });
  if (!sent.ok) return { ok: false, response: problem(502, "Email delivery failed", "The reset was created, but email delivery failed.", {
    errors: [{ field: "_reset", code: ErrorCodes.SMTP_DELIVERY_FAILED, message: "Check email settings and send a new reset" }],
  }) };
  return { ok: true };
}

export async function issueAppUserAdminReset(req: Request, appId: string, appUserId: string, actorUserId: string): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!(await isSmtpReady())) return { ok: false, response: unavailable() };
  const jti = crypto.randomUUID();
  const exp = Math.floor((Date.now() + RESET_TTL_MS) / 1000);
  const signed = await signResetToken({ v: 1, uid: appUserId, exp, jti, realm: "app", aid: appId });
  const outcome = await getDb().begin(async (tx) => {
    const [row] = await tx`
      SELECT u.email, u.name, u.disabled_at, u.deleted_at, a.name AS app_name,
        (SELECT client_id FROM app_credentials WHERE app_id = a.id AND status = 'active' ORDER BY created_at LIMIT 1) AS client_id
      FROM app_users u JOIN apps a ON a.id = u.app_id
      WHERE u.id = ${appUserId} AND u.app_id = ${appId}
      FOR UPDATE OF u
    `;
    if (!row) return { error: "not_found" as const };
    const user = row as { email: string; name: string; disabled_at: Date | null; deleted_at: Date | null; app_name: string; client_id: string | null };
    if (user.disabled_at || user.deleted_at) return { error: "state" as const };
    if (!user.client_id) return { error: "credential" as const };
    await tx`UPDATE app_password_reset_tokens SET used_at = NOW() WHERE app_user_id = ${appUserId} AND used_at IS NULL`;
    await tx`INSERT INTO app_password_reset_tokens (app_user_id, app_id, token_hash, expires_at) VALUES (${appUserId}, ${appId}, ${jti}, ${new Date(exp * 1000)})`;
    await tx`UPDATE app_user_sessions SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND revoked_at IS NULL`;
    await tx`UPDATE oauth_authorization_codes SET used_at = NOW() WHERE app_user_id = ${appUserId} AND used_at IS NULL`;
    await tx`UPDATE oauth_access_tokens SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND revoked_at IS NULL`;
    await tx`UPDATE oauth_refresh_tokens SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND revoked_at IS NULL`;
    await writeAuditEvent({ actorUserId, action: "app_user.password_reset_requested", resourceType: "app_user", resourceId: appUserId, payload: { appId } }, tx);
    return { error: null, user };
  });
  if (outcome.error === "not_found") return { ok: false, response: problem(404, "Not Found", "App user not found") };
  if (outcome.error === "state") return { ok: false, response: stateConflict() };
  if (outcome.error === "credential") return { ok: false, response: problem(409, "Conflict", "The application has no active credential for a reset link.") };
  const user = outcome.user;
  const link = `${requestPublicOrigin(req)}/auth/reset-password/${encodeURIComponent(signed)}?client_id=${encodeURIComponent(user.client_id)}`;
  const sent = await deliverEmail({
    to: user.email,
    subject: `Reset your ${user.app_name} password`,
    text: [`Hi ${user.name},`, "", `An administrator requested a password reset for ${user.app_name}.`, "", "Open this link within 1 hour:", link, "", "If you were not expecting this, contact the application administrator."].join("\n"),
  });
  if (!sent.ok) return { ok: false, response: problem(502, "Email delivery failed", "The reset was created, but email delivery failed.", {
    errors: [{ field: "_reset", code: ErrorCodes.SMTP_DELIVERY_FAILED, message: "Check email settings and send a new reset" }],
  }) };
  return { ok: true };
}
