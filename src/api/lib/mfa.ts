import type { BunRequest, SQL } from "bun";

import type { MfaEnrollment, MfaStatus } from "@z0/contracts/mfa";
import type { RememberedBrowser } from "@z0/contracts/mfa";
import { ErrorCodes } from "@z0/contracts/errors";
import { parseCookies } from "./csrf";
import { sha256Hex, randomToken } from "./crypto";
import { getDb } from "./db";
import { decryptWithDataKey, encryptWithDataKey } from "./instance-keys";
import { loadConfig } from "./config";
import { clientIp } from "./rate-limit";
import { parseClientLabel } from "./client-hint";
import { writeAuditEvent } from "./audit";
import { hasConsolePasskeys, resetPasskeys } from "./passkeys";
import { problem } from "./http";
import { resolveSession } from "./session";
import {
  generateRecoveryCode,
  generateTotpSecret,
  normalizeRecoveryCode,
  provisioningUri,
  matchingTotpStep,
} from "./totp";

export const MFA_CHALLENGE_COOKIE = "z0_mfa_challenge";
const ENROLLMENT_MS = 10 * 60 * 1000;
const CHALLENGE_MS = 5 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;
const REMEMBERED_BROWSER_MS = 30 * 24 * 60 * 60 * 1000;
const REMEMBERED_BROWSER_LIMIT = 5;
const CONSOLE_REMEMBER_COOKIE = "z0_mfa_remember";
let lastMfaCleanupAt = 0;

async function cleanupExpiredMfaData(): Promise<void> {
  if (Date.now() - lastMfaCleanupAt < 60 * 60 * 1000) return;
  lastMfaCleanupAt = Date.now();
  await getDb().begin(async (tx) => {
    await tx`DELETE FROM user_mfa_challenges WHERE expires_at < NOW() - INTERVAL '1 day' OR consumed_at < NOW() - INTERVAL '1 day'`;
    await tx`DELETE FROM app_user_mfa_challenges WHERE expires_at < NOW() - INTERVAL '1 day' OR consumed_at < NOW() - INTERVAL '1 day'`;
    await tx`DELETE FROM user_mfa_remembered_browsers WHERE expires_at < NOW() - INTERVAL '7 days' OR revoked_at < NOW() - INTERVAL '7 days'`;
    await tx`DELETE FROM app_user_mfa_remembered_browsers WHERE expires_at < NOW() - INTERVAL '7 days' OR revoked_at < NOW() - INTERVAL '7 days'`;
  });
}

export type MfaRealm = "console" | "app";
export type MfaProofResult = {
  ok: boolean;
  recoveryCodeUsed: boolean;
  recoveryCodesRemaining: number;
};

export type CreatedMfaChallenge = {
  token: string;
  expiresAt: Date;
  setCookie: string;
};

export type RememberedBrowserAcceptance = { accepted: boolean; setCookie?: string; reuseDetected?: boolean };

function appRememberCookieName(appId: string): string {
  return `z0_mfa_remember_${appId.replaceAll("-", "")}`;
}

function rememberedBrowserCookieHeader(name: string, token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (loadConfig().nodeEnv === "production") parts.push("Secure");
  return parts.join("; ");
}

async function issueRememberedBrowser(input: {
  realm: MfaRealm;
  identityId: string;
  appId?: string;
  req: BunRequest;
}): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + REMEMBERED_BROWSER_MS);
  const fp = await fingerprint(input.req);
  const label = parseClientLabel(input.req.headers.get("user-agent") ?? "");
  await getDb().begin(async (tx) => {
    if (input.realm === "console") {
      await tx`
        INSERT INTO user_mfa_remembered_browsers (
          user_id, token_hash, client_label, ip_hash, user_agent_hash, expires_at
        ) VALUES (${input.identityId}, ${tokenHash}, ${label}, ${fp.ipHash}, ${fp.userAgentHash}, ${expiresAt})
      `;
      await tx`
        UPDATE user_mfa_remembered_browsers SET revoked_at = NOW()
        WHERE id IN (
          SELECT id FROM user_mfa_remembered_browsers
          WHERE user_id = ${input.identityId} AND revoked_at IS NULL AND expires_at > NOW()
          ORDER BY created_at DESC OFFSET ${REMEMBERED_BROWSER_LIMIT}
        )
      `;
    } else {
      await tx`
        INSERT INTO app_user_mfa_remembered_browsers (
          app_user_id, app_id, token_hash, client_label, ip_hash, user_agent_hash, expires_at
        ) VALUES (${input.identityId}, ${input.appId!}, ${tokenHash}, ${label}, ${fp.ipHash}, ${fp.userAgentHash}, ${expiresAt})
      `;
      await tx`
        UPDATE app_user_mfa_remembered_browsers SET revoked_at = NOW()
        WHERE id IN (
          SELECT id FROM app_user_mfa_remembered_browsers
          WHERE app_user_id = ${input.identityId} AND app_id = ${input.appId!}
            AND revoked_at IS NULL AND expires_at > NOW()
          ORDER BY created_at DESC OFFSET ${REMEMBERED_BROWSER_LIMIT}
        )
      `;
    }
  });
  const name = input.realm === "console" ? CONSOLE_REMEMBER_COOKIE : appRememberCookieName(input.appId!);
  return rememberedBrowserCookieHeader(name, token, expiresAt);
}

export function issueConsoleRememberedBrowser(req: BunRequest, userId: string): Promise<string> {
  return issueRememberedBrowser({ realm: "console", identityId: userId, req });
}

export function issueAppUserRememberedBrowser(req: BunRequest, appUserId: string, appId: string): Promise<string> {
  return issueRememberedBrowser({ realm: "app", identityId: appUserId, appId, req });
}

async function acceptRememberedBrowser(input: {
  realm: MfaRealm;
  identityId: string;
  appId?: string;
  req: BunRequest;
}): Promise<RememberedBrowserAcceptance> {
  const name = input.realm === "console" ? CONSOLE_REMEMBER_COOKIE : appRememberCookieName(input.appId!);
  const token = parseCookies(input.req).get(name);
  if (!token) return { accepted: false };
  const hash = await sha256Hex(token);
  const fp = await fingerprint(input.req);
  const tokenNext = randomToken(32);
  const tokenNextHash = await sha256Hex(tokenNext);
  const expiresAt = new Date(Date.now() + REMEMBERED_BROWSER_MS);
  const rows = await getDb().begin(async (tx) => {
    const updated = input.realm === "console"
      ? await tx`
          UPDATE user_mfa_remembered_browsers
          SET previous_token_hash = token_hash, token_hash = ${tokenNextHash},
              last_used_at = NOW(), expires_at = ${expiresAt}
          WHERE user_id = ${input.identityId} AND token_hash = ${hash}
            AND revoked_at IS NULL AND expires_at > NOW()
            AND ip_hash = ${fp.ipHash} AND user_agent_hash = ${fp.userAgentHash}
          RETURNING id
        `
      : await tx`
          UPDATE app_user_mfa_remembered_browsers
          SET previous_token_hash = token_hash, token_hash = ${tokenNextHash},
              last_used_at = NOW(), expires_at = ${expiresAt}
          WHERE app_user_id = ${input.identityId} AND app_id = ${input.appId!}
            AND token_hash = ${hash} AND revoked_at IS NULL AND expires_at > NOW()
            AND ip_hash = ${fp.ipHash} AND user_agent_hash = ${fp.userAgentHash}
          RETURNING id
        `;
    if (updated[0]) {
      const browserId = String((updated[0] as { id: string }).id);
      if (input.realm === "console") {
        await tx`
          INSERT INTO user_mfa_remembered_browser_tokens (browser_id, token_hash)
          VALUES (${browserId}, ${hash}) ON CONFLICT (token_hash) DO NOTHING
        `;
      } else {
        await tx`
          INSERT INTO app_user_mfa_remembered_browser_tokens (browser_id, token_hash)
          VALUES (${browserId}, ${hash}) ON CONFLICT (token_hash) DO NOTHING
        `;
      }
    }
    return updated;
  });
  if (rows[0]) return { accepted: true, setCookie: rememberedBrowserCookieHeader(name, tokenNext, expiresAt) };

  const reused = input.realm === "console"
    ? await getDb()`
        SELECT 1 FROM user_mfa_remembered_browser_tokens t
        JOIN user_mfa_remembered_browsers b ON b.id = t.browser_id
        WHERE b.user_id = ${input.identityId} AND t.token_hash = ${hash} AND b.revoked_at IS NULL
      `
    : await getDb()`
        SELECT 1 FROM app_user_mfa_remembered_browser_tokens t
        JOIN app_user_mfa_remembered_browsers b ON b.id = t.browser_id
        WHERE b.app_user_id = ${input.identityId} AND b.app_id = ${input.appId!}
          AND t.token_hash = ${hash} AND b.revoked_at IS NULL
      `;
  if (reused[0]) {
    if (input.realm === "console") {
      await getDb()`UPDATE user_mfa_remembered_browsers SET revoked_at = NOW() WHERE user_id = ${input.identityId} AND revoked_at IS NULL`;
    } else {
      await getDb()`UPDATE app_user_mfa_remembered_browsers SET revoked_at = NOW() WHERE app_user_id = ${input.identityId} AND app_id = ${input.appId!} AND revoked_at IS NULL`;
    }
    return { accepted: false, reuseDetected: true };
  }
  return { accepted: false };
}

export function acceptConsoleRememberedBrowser(req: BunRequest, userId: string): Promise<RememberedBrowserAcceptance> {
  return acceptRememberedBrowser({ realm: "console", identityId: userId, req });
}

export function acceptAppUserRememberedBrowser(req: BunRequest, appUserId: string, appId: string): Promise<RememberedBrowserAcceptance> {
  return acceptRememberedBrowser({ realm: "app", identityId: appUserId, appId, req });
}

function mapRememberedBrowser(row: unknown): RememberedBrowser {
  const value = row as { id: string; client_label: string; created_at: Date; last_used_at: Date; expires_at: Date };
  return {
    id: String(value.id),
    clientLabel: value.client_label,
    createdAt: new Date(value.created_at).toISOString(),
    lastUsedAt: new Date(value.last_used_at).toISOString(),
    expiresAt: new Date(value.expires_at).toISOString(),
  };
}

export async function listConsoleRememberedBrowsers(userId: string): Promise<RememberedBrowser[]> {
  const rows = await getDb()`
    SELECT id, client_label, created_at, last_used_at, expires_at
    FROM user_mfa_remembered_browsers
    WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > NOW()
    ORDER BY last_used_at DESC
  `;
  return rows.map(mapRememberedBrowser);
}

export async function listAppUserRememberedBrowsers(appUserId: string, appId: string): Promise<RememberedBrowser[]> {
  const rows = await getDb()`
    SELECT id, client_label, created_at, last_used_at, expires_at
    FROM app_user_mfa_remembered_browsers
    WHERE app_user_id = ${appUserId} AND app_id = ${appId}
      AND revoked_at IS NULL AND expires_at > NOW()
    ORDER BY last_used_at DESC
  `;
  return rows.map(mapRememberedBrowser);
}

export async function revokeConsoleRememberedBrowser(userId: string, browserId: string): Promise<boolean> {
  const rows = await getDb()`
    UPDATE user_mfa_remembered_browsers SET revoked_at = NOW()
    WHERE id = ${browserId} AND user_id = ${userId} AND revoked_at IS NULL
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export async function revokeAppUserRememberedBrowser(appUserId: string, appId: string, browserId: string): Promise<boolean> {
  const rows = await getDb()`
    UPDATE app_user_mfa_remembered_browsers SET revoked_at = NOW()
    WHERE id = ${browserId} AND app_user_id = ${appUserId} AND app_id = ${appId} AND revoked_at IS NULL
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export type ResolvedMfaChallenge =
  | { realm: "console"; id: string; userId: string; primaryMethod: string; returnPath: string | null }
  | { realm: "app"; id: string; appUserId: string; appId: string; primaryMethod: string; returnPath: string | null };

function noStoreEnrollment(secret: string, issuer: string, account: string): MfaEnrollment {
  return {
    secret,
    provisioningUri: provisioningUri({ secret, issuer, account }),
    expiresAt: new Date(Date.now() + ENROLLMENT_MS).toISOString(),
  };
}

export async function hasConsoleMfa(userId: string): Promise<boolean> {
  const [row] = await getDb()`
    SELECT 1 FROM user_totp_factors WHERE user_id = ${userId} AND confirmed_at IS NOT NULL
  `;
  return Boolean(row);
}

export async function hasAppUserMfa(appUserId: string, appId: string): Promise<boolean> {
  const [row] = await getDb()`
    SELECT 1
    FROM app_user_totp_factors f
    JOIN app_users u ON u.id = f.app_user_id
    WHERE f.app_user_id = ${appUserId} AND u.app_id = ${appId} AND f.confirmed_at IS NOT NULL
  `;
  return Boolean(row);
}

export async function getConsoleMfaStatus(userId: string): Promise<MfaStatus> {
  const [row] = await getDb()`
    SELECT f.confirmed_at, f.created_at,
      COUNT(c.id) FILTER (WHERE c.used_at IS NULL)::int AS recovery_count
    FROM user_totp_factors f
    LEFT JOIN user_mfa_recovery_codes c ON c.user_id = f.user_id
    WHERE f.user_id = ${userId}
    GROUP BY f.confirmed_at, f.created_at
  `;
  if (!row) return { enabled: false, pendingEnrollment: false, enabledAt: null, recoveryCodesRemaining: 0 };
  const value = row as { confirmed_at: Date | null; created_at: Date; recovery_count: number };
  const pending = !value.confirmed_at && new Date(value.created_at).getTime() > Date.now() - ENROLLMENT_MS;
  return {
    enabled: Boolean(value.confirmed_at),
    pendingEnrollment: pending,
    enabledAt: value.confirmed_at ? new Date(value.confirmed_at).toISOString() : null,
    recoveryCodesRemaining: Number(value.recovery_count ?? 0),
  };
}

export async function getAppUserMfaStatus(appUserId: string, appId: string): Promise<MfaStatus> {
  const [row] = await getDb()`
    SELECT f.confirmed_at, f.created_at,
      COUNT(c.id) FILTER (WHERE c.used_at IS NULL)::int AS recovery_count
    FROM app_user_totp_factors f
    JOIN app_users u ON u.id = f.app_user_id AND u.app_id = ${appId}
    LEFT JOIN app_user_mfa_recovery_codes c ON c.app_user_id = f.app_user_id
    WHERE f.app_user_id = ${appUserId}
    GROUP BY f.confirmed_at, f.created_at
  `;
  if (!row) return { enabled: false, pendingEnrollment: false, enabledAt: null, recoveryCodesRemaining: 0 };
  const value = row as { confirmed_at: Date | null; created_at: Date; recovery_count: number };
  return {
    enabled: Boolean(value.confirmed_at),
    pendingEnrollment: !value.confirmed_at && new Date(value.created_at).getTime() > Date.now() - ENROLLMENT_MS,
    enabledAt: value.confirmed_at ? new Date(value.confirmed_at).toISOString() : null,
    recoveryCodesRemaining: Number(value.recovery_count ?? 0),
  };
}

export async function beginConsoleMfaEnrollment(userId: string): Promise<MfaEnrollment | null> {
  const [identity] = await getDb()`
    SELECT u.email, p.organization_name
    FROM users u CROSS JOIN instance_settings p
    WHERE u.id = ${userId} AND u.status = 'active' AND u.disabled_at IS NULL AND u.deleted_at IS NULL
  `;
  if (!identity) return null;
  if (await hasConsoleMfa(userId)) return null;
  const secret = generateTotpSecret();
  const ciphertext = await encryptWithDataKey(secret);
  await getDb()`
    INSERT INTO user_totp_factors (user_id, secret_ciphertext)
    VALUES (${userId}, ${ciphertext})
    ON CONFLICT (user_id) DO UPDATE SET
      secret_ciphertext = EXCLUDED.secret_ciphertext,
      confirmed_at = NULL,
      created_at = NOW(),
      updated_at = NOW()
    WHERE user_totp_factors.confirmed_at IS NULL
  `;
  const value = identity as { email: string; organization_name: string };
  return noStoreEnrollment(secret, value.organization_name || "z0-auth", value.email);
}

export async function beginAppUserMfaEnrollment(appUserId: string, appId: string): Promise<MfaEnrollment | null> {
  const [identity] = await getDb()`
    SELECT u.email, a.name AS app_name
    FROM app_users u JOIN apps a ON a.id = u.app_id
    WHERE u.id = ${appUserId} AND u.app_id = ${appId}
      AND u.status = 'active' AND u.disabled_at IS NULL AND u.deleted_at IS NULL
  `;
  if (!identity) return null;
  if (await hasAppUserMfa(appUserId, appId)) return null;
  const secret = generateTotpSecret();
  const ciphertext = await encryptWithDataKey(secret);
  await getDb()`
    INSERT INTO app_user_totp_factors (app_user_id, secret_ciphertext)
    VALUES (${appUserId}, ${ciphertext})
    ON CONFLICT (app_user_id) DO UPDATE SET
      secret_ciphertext = EXCLUDED.secret_ciphertext,
      confirmed_at = NULL,
      created_at = NOW(),
      updated_at = NOW()
    WHERE app_user_totp_factors.confirmed_at IS NULL
  `;
  const value = identity as { email: string; app_name: string };
  return noStoreEnrollment(secret, value.app_name || "z0-auth", value.email);
}

async function recoveryRows(codes: string[]): Promise<Array<{ hash: string; suffix: string }>> {
  return Promise.all(codes.map(async (code) => {
    const normalized = normalizeRecoveryCode(code)!;
    return { hash: await sha256Hex(normalized), suffix: normalized.slice(-4) };
  }));
}

async function confirmFactor(input: {
  realm: MfaRealm;
  identityId: string;
  code: string;
}): Promise<string[] | null> {
  const factorRows = input.realm === "console"
    ? await getDb()`
        SELECT secret_ciphertext, created_at FROM user_totp_factors
        WHERE user_id = ${input.identityId} AND confirmed_at IS NULL
          AND created_at > NOW() - INTERVAL '10 minutes'
      `
    : await getDb()`
        SELECT secret_ciphertext, created_at FROM app_user_totp_factors
        WHERE app_user_id = ${input.identityId} AND confirmed_at IS NULL
          AND created_at > NOW() - INTERVAL '10 minutes'
      `;
  const factor = factorRows[0] as { secret_ciphertext: string; created_at: Date } | undefined;
  if (!factor) return null;
  const secret = await decryptWithDataKey(factor.secret_ciphertext);
  const acceptedStep = await matchingTotpStep(secret, input.code);
  if (acceptedStep === null) return null;

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
  const rows = await recoveryRows(codes);
  const confirmed = await getDb().begin(async (tx) => {
    const updated = input.realm === "console"
      ? await tx`
          UPDATE user_totp_factors SET confirmed_at = NOW(), last_accepted_step = ${acceptedStep}, updated_at = NOW()
          WHERE user_id = ${input.identityId} AND confirmed_at IS NULL
            AND secret_ciphertext = ${factor.secret_ciphertext}
            AND created_at > NOW() - INTERVAL '10 minutes'
          RETURNING id
        `
      : await tx`
          UPDATE app_user_totp_factors SET confirmed_at = NOW(), last_accepted_step = ${acceptedStep}, updated_at = NOW()
          WHERE app_user_id = ${input.identityId} AND confirmed_at IS NULL
            AND secret_ciphertext = ${factor.secret_ciphertext}
            AND created_at > NOW() - INTERVAL '10 minutes'
          RETURNING id
        `;
    if (!updated[0]) return false;
    if (input.realm === "console") {
      await tx`DELETE FROM user_mfa_recovery_codes WHERE user_id = ${input.identityId}`;
      for (const row of rows) {
        await tx`
          INSERT INTO user_mfa_recovery_codes (user_id, code_hash, display_suffix)
          VALUES (${input.identityId}, ${row.hash}, ${row.suffix})
        `;
      }
    } else {
      await tx`DELETE FROM app_user_mfa_recovery_codes WHERE app_user_id = ${input.identityId}`;
      for (const row of rows) {
        await tx`
          INSERT INTO app_user_mfa_recovery_codes (app_user_id, code_hash, display_suffix)
          VALUES (${input.identityId}, ${row.hash}, ${row.suffix})
        `;
      }
    }
    return true;
  });
  return confirmed ? codes : null;
}

export function confirmConsoleMfaEnrollment(userId: string, code: string): Promise<string[] | null> {
  return confirmFactor({ realm: "console", identityId: userId, code });
}

export function confirmAppUserMfaEnrollment(appUserId: string, code: string): Promise<string[] | null> {
  return confirmFactor({ realm: "app", identityId: appUserId, code });
}

async function replaceRecoveryCodes(realm: MfaRealm, identityId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
  const rows = await recoveryRows(codes);
  await getDb().begin(async (tx) => {
    if (realm === "console") {
      await tx`DELETE FROM user_mfa_recovery_codes WHERE user_id = ${identityId}`;
      for (const row of rows) {
        await tx`
          INSERT INTO user_mfa_recovery_codes (user_id, code_hash, display_suffix)
          VALUES (${identityId}, ${row.hash}, ${row.suffix})
        `;
      }
    } else {
      await tx`DELETE FROM app_user_mfa_recovery_codes WHERE app_user_id = ${identityId}`;
      for (const row of rows) {
        await tx`
          INSERT INTO app_user_mfa_recovery_codes (app_user_id, code_hash, display_suffix)
          VALUES (${identityId}, ${row.hash}, ${row.suffix})
        `;
      }
    }
  });
  return codes;
}

export function regenerateConsoleRecoveryCodes(userId: string): Promise<string[]> {
  return replaceRecoveryCodes("console", userId);
}

export function regenerateAppUserRecoveryCodes(appUserId: string): Promise<string[]> {
  return replaceRecoveryCodes("app", appUserId);
}

export async function disableConsoleMfa(userId: string, currentSessionId: string): Promise<void> {
  await getDb().begin(async (tx) => {
    await tx`DELETE FROM user_totp_factors WHERE user_id = ${userId}`;
    await tx`DELETE FROM user_mfa_recovery_codes WHERE user_id = ${userId}`;
    await tx`UPDATE user_mfa_challenges SET consumed_at = NOW() WHERE user_id = ${userId} AND consumed_at IS NULL`;
    await tx`UPDATE user_mfa_remembered_browsers SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
    await tx`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${userId} AND id != ${currentSessionId} AND revoked_at IS NULL`;
  });
}

export async function disableAppUserMfa(appUserId: string, currentSessionId: string): Promise<void> {
  await getDb().begin(async (tx) => {
    await tx`DELETE FROM app_user_totp_factors WHERE app_user_id = ${appUserId}`;
    await tx`DELETE FROM app_user_mfa_recovery_codes WHERE app_user_id = ${appUserId}`;
    await tx`UPDATE app_user_mfa_challenges SET consumed_at = NOW() WHERE app_user_id = ${appUserId} AND consumed_at IS NULL`;
    await tx`UPDATE app_user_mfa_remembered_browsers SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND revoked_at IS NULL`;
    await tx`UPDATE app_user_sessions SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND id != ${currentSessionId} AND revoked_at IS NULL`;
  });
}

async function remainingRecoveryCodes(realm: MfaRealm, identityId: string): Promise<number> {
  const rows = realm === "console"
    ? await getDb()`SELECT COUNT(*)::int AS count FROM user_mfa_recovery_codes WHERE user_id = ${identityId} AND used_at IS NULL`
    : await getDb()`SELECT COUNT(*)::int AS count FROM app_user_mfa_recovery_codes WHERE app_user_id = ${identityId} AND used_at IS NULL`;
  return Number((rows[0] as { count: number } | undefined)?.count ?? 0);
}

async function verifyMfaProof(realm: MfaRealm, identityId: string, code: string): Promise<MfaProofResult> {
  const factorRows = realm === "console"
    ? await getDb()`SELECT secret_ciphertext, last_accepted_step FROM user_totp_factors WHERE user_id = ${identityId} AND confirmed_at IS NOT NULL`
    : await getDb()`SELECT secret_ciphertext, last_accepted_step FROM app_user_totp_factors WHERE app_user_id = ${identityId} AND confirmed_at IS NOT NULL`;
  const factor = factorRows[0] as { secret_ciphertext: string; last_accepted_step: number | string | null } | undefined;
  if (!factor) return { ok: false, recoveryCodeUsed: false, recoveryCodesRemaining: 0 };
  const secret = await decryptWithDataKey(factor.secret_ciphertext);
  const acceptedStep = await matchingTotpStep(secret, code);
  if (acceptedStep !== null) {
    const accepted = realm === "console"
      ? await getDb()`
          UPDATE user_totp_factors SET last_accepted_step = ${acceptedStep}, updated_at = NOW()
          WHERE user_id = ${identityId} AND confirmed_at IS NOT NULL
            AND (last_accepted_step IS NULL OR last_accepted_step < ${acceptedStep})
          RETURNING id
        `
      : await getDb()`
          UPDATE app_user_totp_factors SET last_accepted_step = ${acceptedStep}, updated_at = NOW()
          WHERE app_user_id = ${identityId} AND confirmed_at IS NOT NULL
            AND (last_accepted_step IS NULL OR last_accepted_step < ${acceptedStep})
          RETURNING id
        `;
    if (accepted[0]) {
      return { ok: true, recoveryCodeUsed: false, recoveryCodesRemaining: await remainingRecoveryCodes(realm, identityId) };
    }
  }

  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return { ok: false, recoveryCodeUsed: false, recoveryCodesRemaining: await remainingRecoveryCodes(realm, identityId) };
  const hash = await sha256Hex(normalized);
  const used = realm === "console"
    ? await getDb()`
        UPDATE user_mfa_recovery_codes SET used_at = NOW()
        WHERE user_id = ${identityId} AND code_hash = ${hash} AND used_at IS NULL
        RETURNING id
      `
    : await getDb()`
        UPDATE app_user_mfa_recovery_codes SET used_at = NOW()
        WHERE app_user_id = ${identityId} AND code_hash = ${hash} AND used_at IS NULL
        RETURNING id
      `;
  return {
    ok: Boolean(used[0]),
    recoveryCodeUsed: Boolean(used[0]),
    recoveryCodesRemaining: await remainingRecoveryCodes(realm, identityId),
  };
}

export function verifyConsoleMfaProof(userId: string, code: string): Promise<MfaProofResult> {
  return verifyMfaProof("console", userId, code);
}

export function verifyAppUserMfaProof(appUserId: string, code: string): Promise<MfaProofResult> {
  return verifyMfaProof("app", appUserId, code);
}

async function fingerprint(req: Request): Promise<{ ipHash: string; userAgentHash: string }> {
  return {
    ipHash: await sha256Hex(clientIp(req)),
    userAgentHash: await sha256Hex(req.headers.get("user-agent") ?? ""),
  };
}

export async function createConsoleMfaChallenge(
  req: Request,
  userId: string,
  primaryMethod: string,
  returnPath?: string | null,
): Promise<CreatedMfaChallenge> {
  await cleanupExpiredMfaData();
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + CHALLENGE_MS);
  const fp = await fingerprint(req);
  await getDb().begin(async (tx) => {
    await tx`UPDATE user_mfa_challenges SET consumed_at = NOW() WHERE user_id = ${userId} AND consumed_at IS NULL`;
    await tx`
      INSERT INTO user_mfa_challenges (
        user_id, token_hash, primary_method, return_path, ip_hash, user_agent_hash, expires_at
      ) VALUES (${userId}, ${tokenHash}, ${primaryMethod}, ${returnPath ?? null}, ${fp.ipHash}, ${fp.userAgentHash}, ${expiresAt})
    `;
  });
  return { token, expiresAt, setCookie: mfaChallengeCookieHeader(token, expiresAt) };
}

export async function createAppUserMfaChallenge(
  req: Request,
  appUserId: string,
  appId: string,
  primaryMethod: string,
  returnPath?: string | null,
): Promise<CreatedMfaChallenge> {
  await cleanupExpiredMfaData();
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + CHALLENGE_MS);
  const fp = await fingerprint(req);
  await getDb().begin(async (tx) => {
    await tx`UPDATE app_user_mfa_challenges SET consumed_at = NOW() WHERE app_user_id = ${appUserId} AND app_id = ${appId} AND consumed_at IS NULL`;
    await tx`
      INSERT INTO app_user_mfa_challenges (
        app_user_id, app_id, token_hash, primary_method, return_path, ip_hash, user_agent_hash, expires_at
      ) VALUES (${appUserId}, ${appId}, ${tokenHash}, ${primaryMethod}, ${returnPath ?? null}, ${fp.ipHash}, ${fp.userAgentHash}, ${expiresAt})
    `;
  });
  return { token, expiresAt, setCookie: mfaChallengeCookieHeader(token, expiresAt) };
}

export async function resolveMfaChallenge(req: Request): Promise<ResolvedMfaChallenge | null> {
  const token = parseCookies(req).get(MFA_CHALLENGE_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const fp = await fingerprint(req);
  const [consoleRow] = await getDb()`
    SELECT id, user_id, primary_method, return_path
    FROM user_mfa_challenges
    WHERE token_hash = ${tokenHash} AND consumed_at IS NULL AND expires_at > NOW()
      AND ip_hash = ${fp.ipHash} AND user_agent_hash = ${fp.userAgentHash}
  `;
  if (consoleRow) {
    const row = consoleRow as { id: string; user_id: string; primary_method: string; return_path: string | null };
    return { realm: "console", id: String(row.id), userId: String(row.user_id), primaryMethod: row.primary_method, returnPath: row.return_path };
  }
  const [appRow] = await getDb()`
    SELECT id, app_user_id, app_id, primary_method, return_path
    FROM app_user_mfa_challenges
    WHERE token_hash = ${tokenHash} AND consumed_at IS NULL AND expires_at > NOW()
      AND ip_hash = ${fp.ipHash} AND user_agent_hash = ${fp.userAgentHash}
  `;
  if (!appRow) return null;
  const row = appRow as { id: string; app_user_id: string; app_id: string; primary_method: string; return_path: string | null };
  return { realm: "app", id: String(row.id), appUserId: String(row.app_user_id), appId: String(row.app_id), primaryMethod: row.primary_method, returnPath: row.return_path };
}

export async function recordMfaChallengeFailure(challenge: ResolvedMfaChallenge): Promise<void> {
  if (challenge.realm === "console") {
    await getDb()`
      UPDATE user_mfa_challenges
      SET failed_attempts = failed_attempts + 1,
          consumed_at = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() ELSE consumed_at END
      WHERE id = ${challenge.id} AND consumed_at IS NULL
    `;
  } else {
    await getDb()`
      UPDATE app_user_mfa_challenges
      SET failed_attempts = failed_attempts + 1,
          consumed_at = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() ELSE consumed_at END
      WHERE id = ${challenge.id} AND consumed_at IS NULL
    `;
  }
}

export async function consumeMfaChallenge(challenge: ResolvedMfaChallenge, tx?: SQL): Promise<boolean> {
  const db = tx ?? getDb();
  const rows = challenge.realm === "console"
    ? await db`
        UPDATE user_mfa_challenges SET consumed_at = NOW()
        WHERE id = ${challenge.id} AND consumed_at IS NULL AND expires_at > NOW()
        RETURNING id
      `
    : await db`
        UPDATE app_user_mfa_challenges SET consumed_at = NOW()
        WHERE id = ${challenge.id} AND consumed_at IS NULL AND expires_at > NOW()
        RETURNING id
      `;
  return Boolean(rows[0]);
}

export function mfaChallengeCookieHeader(token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const parts = [
    `${MFA_CHALLENGE_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (loadConfig().nodeEnv === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearMfaChallengeCookieHeader(): string {
  const parts = [`${MFA_CHALLENGE_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (loadConfig().nodeEnv === "production") parts.push("Secure");
  return parts.join("; ");
}

export function mfaClientLabel(req: BunRequest): string {
  return parseClientLabel(req.headers.get("user-agent") ?? "");
}

export async function requireRecentConsoleMfa(req: Request, userId: string): Promise<Response | null> {
  const totpEnabled = await hasConsoleMfa(userId);
  const passkeyEnabled = await hasConsolePasskeys(userId);
  if (!totpEnabled && !passkeyEnabled) return null;
  const session = await resolveSession(req);
  if (!session || session.userId !== userId) {
    return problem(401, "Unauthorized", "Authentication required");
  }
  const [row] = await getDb()`
    SELECT 1 FROM sessions
    WHERE id = ${session.sessionId} AND user_id = ${userId}
      AND revoked_at IS NULL
      AND mfa_authenticated_at > NOW() - INTERVAL '10 minutes'
  `;
  if (row) return null;
  return problem(403, "Forbidden", "Verify again to continue.", {
    errors: [{
      field: "_mfa",
      code: passkeyEnabled && !totpEnabled ? ErrorCodes.PASSKEY_STEP_UP_REQUIRED : ErrorCodes.MFA_STEP_UP_REQUIRED,
      message: passkeyEnabled && !totpEnabled ? "Verify with a passkey to continue" : "Verify with MFA to continue",
    }],
  });
}

export async function markConsoleSessionMfaAuthenticated(userId: string, sessionId: string): Promise<boolean> {
  const rows = await getDb()`
    UPDATE sessions SET mfa_authenticated_at = NOW()
    WHERE id = ${sessionId} AND user_id = ${userId} AND revoked_at IS NULL AND expires_at > NOW()
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export async function resetConsoleMfaForAdmin(
  targetUserId: string,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (targetUserId === actorUserId) {
    return { ok: false, response: problem(409, "Conflict", "Use self-service recovery to change your own MFA.") };
  }
  const [target] = await getDb()`
    SELECT m.is_bootstrap
    FROM instance_members m JOIN users u ON u.id = m.user_id
    WHERE u.id = ${targetUserId} AND u.deleted_at IS NULL
  `;
  if (!target) return { ok: false, response: problem(404, "Not Found", "Member not found.") };
  if (Boolean((target as { is_bootstrap: boolean }).is_bootstrap)) {
    return { ok: false, response: problem(409, "Conflict", "The owner must use local owner MFA recovery.") };
  }
  await getDb().begin(async (tx) => {
    await tx`DELETE FROM user_totp_factors WHERE user_id = ${targetUserId}`;
    await tx`DELETE FROM user_mfa_recovery_codes WHERE user_id = ${targetUserId}`;
    await tx`UPDATE user_mfa_challenges SET consumed_at = NOW() WHERE user_id = ${targetUserId} AND consumed_at IS NULL`;
    await tx`UPDATE user_mfa_remembered_browsers SET revoked_at = NOW() WHERE user_id = ${targetUserId} AND revoked_at IS NULL`;
    await tx`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${targetUserId} AND revoked_at IS NULL`;
    const passkeyCount = await resetPasskeys(tx, { realm: "console", userId: targetUserId });
    await writeAuditEvent({ actorUserId, action: "mfa.operator_reset", resourceType: "console_member", resourceId: targetUserId, payload: { realm: "console", passkeyCount } }, tx);
  });
  return { ok: true };
}

export async function resetAppUserMfaForAdmin(
  appUserId: string,
  appId: string,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const [target] = await getDb()`SELECT 1 FROM app_users WHERE id = ${appUserId} AND app_id = ${appId} AND deleted_at IS NULL`;
  if (!target) return { ok: false, response: problem(404, "Not Found", "App user not found.") };
  await getDb().begin(async (tx) => {
    await tx`DELETE FROM app_user_totp_factors WHERE app_user_id = ${appUserId}`;
    await tx`DELETE FROM app_user_mfa_recovery_codes WHERE app_user_id = ${appUserId}`;
    await tx`UPDATE app_user_mfa_challenges SET consumed_at = NOW() WHERE app_user_id = ${appUserId} AND app_id = ${appId} AND consumed_at IS NULL`;
    await tx`UPDATE app_user_mfa_remembered_browsers SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND app_id = ${appId} AND revoked_at IS NULL`;
    await tx`UPDATE app_user_sessions SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND app_id = ${appId} AND revoked_at IS NULL`;
    await tx`UPDATE oauth_authorization_codes SET used_at = NOW() WHERE app_user_id = ${appUserId} AND app_id = ${appId} AND used_at IS NULL`;
    await tx`UPDATE oauth_access_tokens SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND app_id = ${appId} AND revoked_at IS NULL`;
    await tx`UPDATE oauth_refresh_tokens SET revoked_at = NOW() WHERE app_user_id = ${appUserId} AND app_id = ${appId} AND revoked_at IS NULL`;
    const passkeyCount = await resetPasskeys(tx, { realm: "app", appUserId, appId });
    await writeAuditEvent({ actorUserId, action: "mfa.operator_reset", resourceType: "app_user", resourceId: appUserId, payload: { realm: "app", appId, passkeyCount } }, tx);
  });
  return { ok: true };
}
