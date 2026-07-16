import type { BunRequest } from "bun";

import { ErrorCodes } from "@z0/contracts/errors";
import { accountCanAuthenticate, type AccountLifecycleRow } from "./account-lifecycle";
import { ensureGroupMemberForAppUser } from "./group-sso";
import { writeAuditEvent } from "./audit";
import { getDb } from "./db";
import { problem } from "./http";
import {
  clearMfaChallengeCookieHeader,
  consumeMfaChallenge,
  recordMfaChallengeFailure,
  resolveMfaChallenge,
  verifyAppUserMfaProof,
  verifyConsoleMfaProof,
  issueAppUserRememberedBrowser,
  issueConsoleRememberedBrowser,
} from "./mfa";
import { checkRateLimit, clientIp } from "./rate-limit";
import { appSessionCookieHeader, insertAppSession, prepareAppSession } from "./app-session";
import { insertSession, prepareSession, sessionCookieHeader } from "./session";

export type CompletedMfaSignIn = {
  realm: "console" | "app";
  userId: string;
  appId?: string;
  setSessionCookie: string;
  clearChallengeCookie: string;
  returnPath: string | null;
  recoveryCodeUsed: boolean;
  recoveryCodesRemaining: number;
  rememberedBrowserCookie?: string;
};

export async function completeMfaSignIn(
  req: BunRequest,
  code: string,
  rememberBrowser = false,
): Promise<{ ok: true; result: CompletedMfaSignIn } | { ok: false; response: Response }> {
  const challenge = await resolveMfaChallenge(req);
  if (!challenge) {
    return {
      ok: false,
      response: problem(401, "Unauthorized", "The MFA challenge expired. Sign in again.", {
        errors: [{ field: "_mfa", code: ErrorCodes.MFA_CHALLENGE_EXPIRED, message: "Sign in again" }],
      }),
    };
  }

  const identityId = challenge.realm === "console" ? challenge.userId : challenge.appUserId;
  const rate = await checkRateLimit({
    key: `mfa-challenge:${challenge.realm}:${identityId}:${clientIp(req)}`,
    limit: 5,
    windowMs: 5 * 60 * 1000,
  });
  if (!rate.allowed) {
    await recordMfaChallengeFailure(challenge);
    return {
      ok: false,
      response: problem(429, "Too Many Requests", "Too many MFA code attempts. Sign in again.", {
        errors: [{ field: "_rate", code: ErrorCodes.RATE_LIMITED, message: "Sign in again" }],
      }),
    };
  }

  const proof = challenge.realm === "console"
    ? await verifyConsoleMfaProof(challenge.userId, code)
    : await verifyAppUserMfaProof(challenge.appUserId, code);
  if (!proof.ok) {
    await recordMfaChallengeFailure(challenge);
    await writeAuditEvent({
      action: "mfa.challenge_failed",
      resourceType: challenge.realm === "console" ? "console_member" : "app_user",
      resourceId: identityId,
      payload: { realm: challenge.realm, appId: challenge.realm === "app" ? challenge.appId : undefined, reason: "invalid_code" },
    });
    return {
      ok: false,
      response: problem(401, "Unauthorized", "The authentication code is invalid.", {
        errors: [{ field: "code", code: ErrorCodes.MFA_CODE_INVALID, message: "Enter a valid authentication or recovery code" }],
      }),
    };
  }

  const now = new Date();
  let setSessionCookie: string;
  if (challenge.realm === "console") {
    const prepared = await prepareSession(req);
    const session = await getDb().begin(async (tx) => {
      const [account] = await tx`
        SELECT status, disabled_at, locked_until, deleted_at
        FROM users WHERE id = ${challenge.userId} FOR UPDATE
      `;
      if (!account) return null;
      const current = account as AccountLifecycleRow & { status: string };
      if (current.status !== "active" || !accountCanAuthenticate(current)) return null;
      if (!(await consumeMfaChallenge(challenge, tx))) return null;
      return insertSession(tx, challenge.userId, prepared, {
        primaryAuthenticatedAt: now,
        mfaAuthenticatedAt: now,
        authenticationMethod: `${challenge.primaryMethod}+totp`,
      });
    });
    if (!session) return { ok: false, response: problem(401, "Unauthorized", "The MFA challenge expired. Sign in again.") };
    setSessionCookie = sessionCookieHeader(session.token, session.expiresAt);
  } else {
    const prepared = await prepareAppSession(req);
    const session = await getDb().begin(async (tx) => {
      const [account] = await tx`
        SELECT status, disabled_at, locked_until, deleted_at, email
        FROM app_users WHERE id = ${challenge.appUserId} AND app_id = ${challenge.appId} FOR UPDATE
      `;
      if (!account) return null;
      const current = account as AccountLifecycleRow & { status: string };
      if (current.status !== "active" || !accountCanAuthenticate(current)) return null;
      if (!(await consumeMfaChallenge(challenge, tx))) return null;
      return insertAppSession(tx, challenge.appUserId, challenge.appId, prepared, {
        primaryAuthenticatedAt: now,
        mfaAuthenticatedAt: now,
        authenticationMethod: `${challenge.primaryMethod}+totp`,
      });
    });
    if (!session) return { ok: false, response: problem(401, "Unauthorized", "The MFA challenge expired. Sign in again.") };
    setSessionCookie = appSessionCookieHeader(session.token, session.expiresAt);
    const [user] = await getDb()`SELECT email FROM app_users WHERE id = ${challenge.appUserId} AND app_id = ${challenge.appId}`;
    if (user) await ensureGroupMemberForAppUser(challenge.appUserId, challenge.appId, String((user as { email: string }).email));
  }

  await writeAuditEvent({
    actorUserId: challenge.realm === "console" ? challenge.userId : undefined,
    action: "mfa.challenge_succeeded",
    resourceType: challenge.realm === "console" ? "console_member" : "app_user",
    resourceId: identityId,
    payload: {
      realm: challenge.realm,
      appId: challenge.realm === "app" ? challenge.appId : undefined,
      primaryMethod: challenge.primaryMethod,
      recoveryCodeUsed: proof.recoveryCodeUsed,
    },
  });
  if (proof.recoveryCodeUsed) {
    await writeAuditEvent({
      actorUserId: challenge.realm === "console" ? challenge.userId : undefined,
      action: "mfa.recovery_code_used",
      resourceType: challenge.realm === "console" ? "console_member" : "app_user",
      resourceId: identityId,
      payload: {
        realm: challenge.realm,
        appId: challenge.realm === "app" ? challenge.appId : undefined,
        recoveryCodesRemaining: proof.recoveryCodesRemaining,
      },
    });
  }

  const rememberedBrowserCookie = rememberBrowser
    ? challenge.realm === "console"
      ? await issueConsoleRememberedBrowser(req, challenge.userId)
      : await issueAppUserRememberedBrowser(req, challenge.appUserId, challenge.appId)
    : undefined;
  if (rememberedBrowserCookie) {
    await writeAuditEvent({
      actorUserId: challenge.realm === "console" ? challenge.userId : undefined,
      action: "mfa.remembered_browser_added",
      resourceType: challenge.realm === "console" ? "console_member" : "app_user",
      resourceId: identityId,
      payload: { realm: challenge.realm, appId: challenge.realm === "app" ? challenge.appId : undefined },
    });
  }
  await writeAuditEvent({
    actorUserId: challenge.realm === "console" ? challenge.userId : undefined,
    action: challenge.realm === "console" ? "auth.login_succeeded" : "auth.app_login_succeeded",
    resourceType: challenge.realm === "console" ? "auth" : "app",
    resourceId: challenge.realm === "app" ? challenge.appId : undefined,
    payload: challenge.realm === "console"
      ? { audience: "console", mfa: true }
      : { appUserId: challenge.appUserId, mfa: true },
  });

  return {
    ok: true,
    result: {
      realm: challenge.realm,
      userId: identityId,
      appId: challenge.realm === "app" ? challenge.appId : undefined,
      setSessionCookie,
      clearChallengeCookie: clearMfaChallengeCookieHeader(),
      returnPath: challenge.returnPath,
      recoveryCodeUsed: proof.recoveryCodeUsed,
      recoveryCodesRemaining: proof.recoveryCodesRemaining,
      rememberedBrowserCookie,
    },
  };
}
