import type { BunRequest } from "bun";

import type { ChangePasswordRequest, LoginRequest, ReauthenticateRequest } from "@z0/contracts/auth";
import { ErrorCodes } from "@z0/contracts/errors";
import type { ForgotPasswordRequest, ResetPasswordRequest } from "@z0/contracts/email-settings";
import { parseJsonBody, validateRequiredString } from "@z0/contracts/validation";

import { buildSessionResponse, requireSession } from "../lib/auth";
import { validateCsrf, parseCookies } from "../lib/csrf";
import { json, problem } from "../lib/http";
import { buildAuthenticatedSessionPayload } from "../lib/session-payload";
import {
  clearSessionCookieHeader,
  revokeSessionByToken,
  SESSION_COOKIE,
} from "../lib/session";
import { completePasswordReset, requestPasswordReset } from "../lib/password-reset";
import {
  completeAppPasswordReset,
  requestAppPasswordReset,
} from "../lib/app-password-reset";
import { verifyResetToken } from "../lib/instance-keys";
import { changePassword } from "../lib/users";
import { runLogin } from "./service";
import { requireRecentConsoleMfa } from "../lib/mfa";
import { getDb } from "../lib/db";
import { verifyPassword } from "../lib/password";
import { checkRateLimit, clientIp } from "../lib/rate-limit";
import { writeAuditEvent } from "../lib/audit";

export async function handleLogin(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const parsed = await parseJsonBody<LoginRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await runLogin(req, parsed.body.email, parsed.body.password ?? "");
  if (!result.ok) return result.response;

  if (result.mfaRequired) {
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    headers.set("Set-Cookie", result.setCookie);
    return new Response(JSON.stringify({
      authenticated: false,
      mfaRequired: true,
      challengeExpiresAt: result.challengeExpiresAt.toISOString(),
    }), { status: 202, headers });
  }

  const payload = await buildAuthenticatedSessionPayload(result.userId);
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.set("Set-Cookie", result.setCookie);
  if (result.rememberedBrowserCookie) headers.append("Set-Cookie", result.rememberedBrowserCookie);

  return new Response(JSON.stringify(payload), { status: 200, headers });
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

export async function handleForgotPassword(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const parsed = await parseJsonBody<ForgotPasswordRequest>(req);
  if (!parsed.ok) return parsed.response;

  if (parsed.body.clientId?.trim()) {
    return requestAppPasswordReset(req, parsed.body);
  }
  return requestPasswordReset(req, parsed.body);
}

export async function handleResetPassword(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const parsed = await parseJsonBody<ResetPasswordRequest>(req);
  if (!parsed.ok) return parsed.response;

  const token = parsed.body.token?.trim();
  if (token) {
    const verified = await verifyResetToken(token);
    if (verified.ok && verified.payload.realm === "app") {
      return completeAppPasswordReset(req, parsed.body, parsed.body.clientId?.trim());
    }
  }

  return completePasswordReset(req, parsed.body);
}

export async function handleChangePassword(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const stepUpError = await requireRecentConsoleMfa(req, auth.userId);
  if (stepUpError) return stepUpError;

  const parsed = await parseJsonBody<ChangePasswordRequest>(req);
  if (!parsed.ok) return parsed.response;

  const result = await changePassword(req, auth.userId, auth.sessionId, parsed.body);
  if (!result.ok) return result.response;
  return json({ ok: true });
}

export async function handleReauthenticate(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<ReauthenticateRequest>(req);
  if (!parsed.ok) return parsed.response;
  const passwordErrors = validateRequiredString(parsed.body.password, "password", "Password");
  if (passwordErrors.length > 0) {
    return problem(400, "Validation Error", "Invalid request", { errors: passwordErrors });
  }

  const rate = await checkRateLimit({
    key: `operator-reauthenticate:${auth.userId}:${clientIp(req)}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) {
    return problem(429, "Too Many Requests", "Too many reauthentication attempts.", {
      errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Try again later" }],
    });
  }

  const [credential] = await getDb()`
    SELECT password_hash FROM password_credentials WHERE user_id = ${auth.userId}
  `;
  const valid = credential && await verifyPassword(
    parsed.body.password,
    String((credential as { password_hash: string }).password_hash),
  );
  if (!valid) {
    await writeAuditEvent({
      actorUserId: auth.userId,
      action: "session.reauthentication_failed",
      resourceType: "session",
      resourceId: auth.sessionId,
    });
    return problem(401, "Unauthorized", "The current password is invalid.", {
      errors: [{
        field: "password",
        code: ErrorCodes.INVALID_CREDENTIALS,
        message: "Enter your current password",
      }],
    });
  }

  const updated = await getDb().begin(async (tx) => {
    const rows = await tx`
      UPDATE sessions
      SET primary_authenticated_at = NOW()
      WHERE id = ${auth.sessionId} AND user_id = ${auth.userId}
        AND revoked_at IS NULL AND idle_expires_at > NOW() AND expires_at > NOW()
      RETURNING id
    `;
    if (!rows[0]) return false;
    await writeAuditEvent({
      actorUserId: auth.userId,
      action: "session.reauthentication_succeeded",
      resourceType: "session",
      resourceId: auth.sessionId,
    }, tx);
    return true;
  });
  return updated
    ? json({ ok: true })
    : problem(401, "Unauthorized", "Authentication required");
}
