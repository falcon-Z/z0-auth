import type { BunRequest } from "bun";

import type { MfaEnrollmentConfirmRequest } from "@z0/contracts/mfa";
import { ErrorCodes } from "@z0/contracts/errors";
import { parseJsonBody } from "@z0/contracts/validation";
import { requireSession } from "../lib/auth";
import { writeAuditEvent } from "../lib/audit";
import { validateCsrf } from "../lib/csrf";
import { json, problem } from "../lib/http";
import {
  beginConsoleMfaEnrollment,
  confirmConsoleMfaEnrollment,
  disableConsoleMfa,
  getConsoleMfaStatus,
  regenerateConsoleRecoveryCodes,
  verifyConsoleMfaProof,
  markConsoleSessionMfaAuthenticated,
  listConsoleRememberedBrowsers,
  revokeConsoleRememberedBrowser,
} from "../lib/mfa";
import { checkRateLimit, clientIp } from "../lib/rate-limit";
import { completeMfaSignIn } from "../lib/mfa-completion";
import { buildAuthenticatedSessionPayload } from "../lib/session-payload";

type ProofRequest = { code: string };

function noStoreJson(data: unknown, status = 200): Response {
  return json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function invalidCode(): Response {
  return problem(401, "Unauthorized", "The authentication code is invalid.", {
    errors: [{ field: "code", code: ErrorCodes.MFA_CODE_INVALID, message: "Enter a valid authentication or recovery code" }],
  });
}

async function authenticatedMutation(req: BunRequest) {
  const csrfError = validateCsrf(req);
  if (csrfError) return { ok: false as const, response: csrfError };
  const auth = await requireSession(req);
  if (!auth.ok) return auth;
  return auth;
}

export async function handleGetMfaStatus(req: BunRequest): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  return noStoreJson(await getConsoleMfaStatus(auth.userId));
}

export async function handleStartMfaEnrollment(req: BunRequest): Promise<Response> {
  const auth = await authenticatedMutation(req);
  if (!auth.ok) return auth.response;
  const status = await getConsoleMfaStatus(auth.userId);
  if (status.enabled) {
    return problem(409, "Conflict", "MFA is already enabled.", {
      errors: [{ field: "_mfa", code: ErrorCodes.MFA_ALREADY_ENABLED, message: "MFA is already enabled" }],
    });
  }
  const rate = await checkRateLimit({ key: `mfa-enroll:${auth.userId}:${clientIp(req)}`, limit: 5, windowMs: 15 * 60 * 1000 });
  if (!rate.allowed) {
    return problem(429, "Too Many Requests", "Too many MFA enrollment attempts.", {
      errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Try again later" }],
    });
  }
  const enrollment = await beginConsoleMfaEnrollment(auth.userId);
  if (!enrollment) return problem(409, "Conflict", "MFA enrollment could not be started.");
  await writeAuditEvent({ actorUserId: auth.userId, action: "mfa.enrollment_started", resourceType: "console_member", resourceId: auth.userId, payload: { realm: "console" } });
  return noStoreJson(enrollment, 201);
}

export async function handleConfirmMfaEnrollment(req: BunRequest): Promise<Response> {
  const auth = await authenticatedMutation(req);
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<MfaEnrollmentConfirmRequest>(req);
  if (!parsed.ok) return parsed.response;
  const rate = await checkRateLimit({ key: `mfa-enroll-confirm:${auth.userId}:${clientIp(req)}`, limit: 5, windowMs: 10 * 60 * 1000 });
  if (!rate.allowed) {
    return problem(429, "Too Many Requests", "Too many MFA code attempts.", {
      errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Try enrollment again later" }],
    });
  }
  const recoveryCodes = await confirmConsoleMfaEnrollment(auth.userId, parsed.body.code ?? "");
  if (!recoveryCodes) return invalidCode();
  await markConsoleSessionMfaAuthenticated(auth.userId, auth.sessionId);
  await writeAuditEvent({ actorUserId: auth.userId, action: "mfa.enabled", resourceType: "console_member", resourceId: auth.userId, payload: { realm: "console", recoveryCodeCount: recoveryCodes.length } });
  return noStoreJson({ recoveryCodes });
}

export async function handleRegenerateRecoveryCodes(req: BunRequest): Promise<Response> {
  const auth = await authenticatedMutation(req);
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<ProofRequest>(req);
  if (!parsed.ok) return parsed.response;
  const proof = await verifyConsoleMfaProof(auth.userId, parsed.body.code ?? "");
  if (!proof.ok) return invalidCode();
  await markConsoleSessionMfaAuthenticated(auth.userId, auth.sessionId);
  const recoveryCodes = await regenerateConsoleRecoveryCodes(auth.userId);
  await writeAuditEvent({ actorUserId: auth.userId, action: "mfa.recovery_codes_regenerated", resourceType: "console_member", resourceId: auth.userId, payload: { realm: "console", recoveryCodeCount: recoveryCodes.length } });
  return noStoreJson({ recoveryCodes });
}

export async function handleDisableMfa(req: BunRequest): Promise<Response> {
  const auth = await authenticatedMutation(req);
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<ProofRequest>(req);
  if (!parsed.ok) return parsed.response;
  const proof = await verifyConsoleMfaProof(auth.userId, parsed.body.code ?? "");
  if (!proof.ok) return invalidCode();
  await disableConsoleMfa(auth.userId, auth.sessionId);
  await writeAuditEvent({ actorUserId: auth.userId, action: "mfa.disabled", resourceType: "console_member", resourceId: auth.userId, payload: { realm: "console" } });
  return json({ ok: true });
}

export async function handleCompleteMfaChallenge(req: BunRequest): Promise<Response> {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;
  const parsed = await parseJsonBody<ProofRequest>(req);
  if (!parsed.ok) return parsed.response;
  const completed = await completeMfaSignIn(req, parsed.body.code ?? "", Boolean((parsed.body as { rememberBrowser?: boolean }).rememberBrowser));
  if (!completed.ok) return completed.response;
  const payload = completed.result.realm === "console"
    ? await buildAuthenticatedSessionPayload(completed.result.userId)
    : {
        authenticated: true,
        recoveryCodeUsed: completed.result.recoveryCodeUsed,
        recoveryCodesRemaining: completed.result.recoveryCodesRemaining,
      };
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  headers.append("Set-Cookie", completed.result.setSessionCookie);
  headers.append("Set-Cookie", completed.result.clearChallengeCookie);
  if (completed.result.rememberedBrowserCookie) headers.append("Set-Cookie", completed.result.rememberedBrowserCookie);
  return new Response(JSON.stringify(payload), { status: 200, headers });
}

export async function handleMfaStepUp(req: BunRequest): Promise<Response> {
  const auth = await authenticatedMutation(req);
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<ProofRequest>(req);
  if (!parsed.ok) return parsed.response;
  const proof = await verifyConsoleMfaProof(auth.userId, parsed.body.code ?? "");
  if (!proof.ok) return invalidCode();
  if (!(await markConsoleSessionMfaAuthenticated(auth.userId, auth.sessionId))) {
    return problem(401, "Unauthorized", "Authentication required");
  }
  await writeAuditEvent({ actorUserId: auth.userId, action: "mfa.step_up_succeeded", resourceType: "console_member", resourceId: auth.userId, payload: { realm: "console", recoveryCodeUsed: proof.recoveryCodeUsed } });
  return noStoreJson({ ok: true, recoveryCodeUsed: proof.recoveryCodeUsed, recoveryCodesRemaining: proof.recoveryCodesRemaining });
}

export async function handleListRememberedBrowsers(req: BunRequest): Promise<Response> {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  return noStoreJson({ browsers: await listConsoleRememberedBrowsers(auth.userId) });
}

export async function handleRevokeRememberedBrowser(req: BunRequest): Promise<Response> {
  const auth = await authenticatedMutation(req);
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<{ browserId: string }>(req);
  if (!parsed.ok) return parsed.response;
  const revoked = await revokeConsoleRememberedBrowser(auth.userId, parsed.body.browserId ?? "");
  if (!revoked) return problem(404, "Not Found", "Remembered browser not found.");
  await writeAuditEvent({ actorUserId: auth.userId, action: "mfa.remembered_browser_revoked", resourceType: "console_member", resourceId: auth.userId, payload: { realm: "console", browserId: parsed.body.browserId } });
  return json({ ok: true });
}
