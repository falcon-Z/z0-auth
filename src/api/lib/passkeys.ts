import type { BunRequest, SQL } from "bun";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { cose, decodeCredentialPublicKey } from "@simplewebauthn/server/helpers";

import type { PasskeyList, PasskeySummary } from "@z0/contracts/passkeys";
import { ErrorCodes } from "@z0/contracts/errors";
import { normalizeEmail, validateEmail } from "@z0/contracts/validation";
import { requestPublicOrigin, loadConfig } from "./config";
import { randomToken, sha256Hex } from "./crypto";
import { parseCookies } from "./csrf";
import { getDb, pgTextArray } from "./db";
import { problem } from "./http";
import { checkRateLimit, clientIp } from "./rate-limit";
import { safeReturnPath } from "../../web/safe-return-path";
import { prepareSession, insertSession, sessionCookieHeader, resolveSession } from "./session";
import {
  prepareAppSession,
  insertAppSession,
  appSessionCookieHeader,
  resolveAppSessionForApp,
} from "./app-session";
import { accountCanAuthenticate, type AccountLifecycleRow } from "./account-lifecycle";
import { ensureGroupMemberForAppUser } from "./group-sso";
import { writeAuditEvent } from "./audit";
import { deriveOpaquePublicValue } from "./instance-keys";

export const PASSKEY_CEREMONY_COOKIE = "z0_passkey_ceremony";
export const MAX_PASSKEYS = 10;
const CEREMONY_MS = 5 * 60 * 1000;
const SUPPORTED_ALGORITHMS = [-7, -257] as const;

type Realm = "console" | "app";
type Purpose = "registration" | "authentication" | "step_up";

type PasskeyContext =
  | { realm: "console"; userId: string }
  | { realm: "app"; appUserId: string; appId: string };

type Ceremony = {
  realm: Realm;
  id: string;
  identityId: string | null;
  appId: string | null;
  purpose: Purpose;
  challengeHash: string;
  expectedOrigin: string;
  expectedRpId: string;
  returnPath: string | null;
};

type CredentialRow = {
  id: string;
  identity_id: string;
  app_id: string | null;
  credential_id: string;
  public_key: string;
  signature_counter: number | string;
  transports: string[] | null;
  backup_eligible: boolean;
};

function passkeyProblem(
  status: number,
  detail: string,
  code: string,
  field = "_passkey",
): Response {
  return problem(status, status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Passkey error", detail, {
    errors: [{ field, code, message: detail }],
  });
}

export function passkeyRp(req: Request): { origin: string; rpId: string; rpName: string } | Response {
  let origin: string;
  try {
    origin = requestPublicOrigin(req);
  } catch {
    return passkeyProblem(503, "Passkeys are unavailable until PUBLIC_ORIGIN is configured.", ErrorCodes.PASSKEY_ORIGIN_UNAVAILABLE);
  }
  const url = new URL(origin);
  const local = url.protocol === "http:" && url.hostname === "localhost";
  if (url.protocol !== "https:" && !local) {
    return passkeyProblem(503, "Passkeys require HTTPS, except on http://localhost for development.", ErrorCodes.PASSKEY_ORIGIN_UNAVAILABLE);
  }
  return { origin: url.origin, rpId: url.hostname.toLowerCase(), rpName: loadConfig().appName };
}

function cookieHeader(token: string, expiresAt: Date): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const parts = [
    `${PASSKEY_CEREMONY_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (loadConfig().nodeEnv === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearPasskeyCeremonyCookieHeader(): string {
  const parts = [`${PASSKEY_CEREMONY_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (loadConfig().nodeEnv === "production") parts.push("Secure");
  return parts.join("; ");
}

async function fingerprint(req: Request): Promise<{ ipHash: string; userAgentHash: string }> {
  return {
    ipHash: await sha256Hex(clientIp(req)),
    userAgentHash: await sha256Hex(req.headers.get("user-agent") ?? ""),
  };
}

async function cleanupCeremonies(): Promise<void> {
  await getDb().begin(async (tx) => {
    await tx`DELETE FROM user_passkey_ceremonies WHERE expires_at < NOW() - INTERVAL '1 day' OR consumed_at < NOW() - INTERVAL '1 day'`;
    await tx`DELETE FROM app_user_passkey_ceremonies WHERE expires_at < NOW() - INTERVAL '1 day' OR consumed_at < NOW() - INTERVAL '1 day'`;
  });
}

async function createCeremony(
  req: Request,
  input: {
    realm: Realm;
    identityId: string | null;
    appId?: string;
    purpose: Purpose;
    challenge: string;
    origin: string;
    rpId: string;
    returnPath?: string | null;
  },
): Promise<{ setCookie: string; expiresAt: Date }> {
  await cleanupCeremonies();
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const challengeHash = await sha256Hex(input.challenge);
  const expiresAt = new Date(Date.now() + CEREMONY_MS);
  const fp = await fingerprint(req);
  await getDb().begin(async (tx) => {
    if (input.realm === "console") {
      if (input.identityId) {
        await tx`UPDATE user_passkey_ceremonies SET consumed_at = NOW() WHERE user_id = ${input.identityId} AND purpose = ${input.purpose} AND consumed_at IS NULL`;
      }
      await tx`
        INSERT INTO user_passkey_ceremonies (
          user_id, token_hash, challenge_hash, purpose, expected_origin, expected_rp_id,
          return_path, ip_hash, user_agent_hash, expires_at
        ) VALUES (
          ${input.identityId}, ${tokenHash}, ${challengeHash}, ${input.purpose}, ${input.origin},
          ${input.rpId}, ${input.returnPath ?? null}, ${fp.ipHash}, ${fp.userAgentHash}, ${expiresAt}
        )
      `;
    } else {
      if (input.identityId) {
        await tx`
          UPDATE app_user_passkey_ceremonies SET consumed_at = NOW()
          WHERE app_id = ${input.appId!} AND app_user_id = ${input.identityId}
            AND purpose = ${input.purpose} AND consumed_at IS NULL
        `;
      }
      await tx`
        INSERT INTO app_user_passkey_ceremonies (
          app_user_id, app_id, token_hash, challenge_hash, purpose, expected_origin, expected_rp_id,
          return_path, ip_hash, user_agent_hash, expires_at
        ) VALUES (
          ${input.identityId}, ${input.appId!}, ${tokenHash}, ${challengeHash}, ${input.purpose},
          ${input.origin}, ${input.rpId}, ${input.returnPath ?? null}, ${fp.ipHash}, ${fp.userAgentHash}, ${expiresAt}
        )
      `;
    }
  });
  return { setCookie: cookieHeader(token, expiresAt), expiresAt };
}

async function resolveCeremony(req: Request): Promise<Ceremony | null> {
  const token = parseCookies(req).get(PASSKEY_CEREMONY_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const fp = await fingerprint(req);
  const [consoleRow] = await getDb()`
    SELECT id, user_id, purpose, challenge_hash, expected_origin, expected_rp_id, return_path
    FROM user_passkey_ceremonies
    WHERE token_hash = ${tokenHash} AND consumed_at IS NULL AND expires_at > NOW()
      AND ip_hash = ${fp.ipHash} AND user_agent_hash = ${fp.userAgentHash}
  `;
  if (consoleRow) {
    const row = consoleRow as Record<string, unknown>;
    return {
      realm: "console",
      id: String(row.id),
      identityId: row.user_id ? String(row.user_id) : null,
      appId: null,
      purpose: String(row.purpose) as Purpose,
      challengeHash: String(row.challenge_hash),
      expectedOrigin: String(row.expected_origin),
      expectedRpId: String(row.expected_rp_id),
      returnPath: row.return_path ? String(row.return_path) : null,
    };
  }
  const [appRow] = await getDb()`
    SELECT id, app_user_id, app_id, purpose, challenge_hash, expected_origin, expected_rp_id, return_path
    FROM app_user_passkey_ceremonies
    WHERE token_hash = ${tokenHash} AND consumed_at IS NULL AND expires_at > NOW()
      AND ip_hash = ${fp.ipHash} AND user_agent_hash = ${fp.userAgentHash}
  `;
  if (!appRow) return null;
  const row = appRow as Record<string, unknown>;
  return {
    realm: "app",
    id: String(row.id),
    identityId: row.app_user_id ? String(row.app_user_id) : null,
    appId: String(row.app_id),
    purpose: String(row.purpose) as Purpose,
    challengeHash: String(row.challenge_hash),
    expectedOrigin: String(row.expected_origin),
    expectedRpId: String(row.expected_rp_id),
    returnPath: row.return_path ? String(row.return_path) : null,
  };
}

async function recordCeremonyFailure(ceremony: Ceremony): Promise<void> {
  if (ceremony.realm === "console") {
    await getDb()`
      UPDATE user_passkey_ceremonies
      SET failed_attempts = failed_attempts + 1,
          consumed_at = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() ELSE consumed_at END
      WHERE id = ${ceremony.id} AND consumed_at IS NULL
    `;
  } else {
    await getDb()`
      UPDATE app_user_passkey_ceremonies
      SET failed_attempts = failed_attempts + 1,
          consumed_at = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() ELSE consumed_at END
      WHERE id = ${ceremony.id} AND consumed_at IS NULL
    `;
  }
}

async function consumeCeremony(ceremony: Ceremony, tx: SQL): Promise<boolean> {
  const rows = ceremony.realm === "console"
    ? await tx`UPDATE user_passkey_ceremonies SET consumed_at = NOW() WHERE id = ${ceremony.id} AND consumed_at IS NULL AND expires_at > NOW() RETURNING id`
    : await tx`UPDATE app_user_passkey_ceremonies SET consumed_at = NOW() WHERE id = ${ceremony.id} AND consumed_at IS NULL AND expires_at > NOW() RETURNING id`;
  return Boolean(rows[0]);
}

async function expectedChallenge(challenge: string, expectedHash: string): Promise<boolean> {
  return (await sha256Hex(challenge)) === expectedHash;
}

function mapSummary(row: Record<string, unknown>): PasskeySummary {
  return {
    id: String(row.id),
    label: String(row.label),
    createdAt: new Date(row.created_at as Date).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as Date).toISOString() : null,
    backupEligible: Boolean(row.backup_eligible),
    backedUp: Boolean(row.backup_state),
  };
}

export async function listPasskeys(context: PasskeyContext): Promise<PasskeyList> {
  const rows = context.realm === "console"
    ? await getDb()`SELECT id, label, created_at, last_used_at, backup_eligible, backup_state FROM user_passkeys WHERE user_id = ${context.userId} AND removed_at IS NULL ORDER BY created_at DESC`
    : await getDb()`SELECT id, label, created_at, last_used_at, backup_eligible, backup_state FROM app_user_passkeys WHERE app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND removed_at IS NULL ORDER BY created_at DESC`;
  const passkeys = rows.map((row) => mapSummary(row as Record<string, unknown>));
  return { passkeys, canRegister: passkeys.length < MAX_PASSKEYS, maxPasskeys: MAX_PASSKEYS };
}

async function requireFreshRegistrationSession(context: PasskeyContext, sessionId: string): Promise<Response | null> {
  const [row] = context.realm === "console"
    ? await getDb()`
        SELECT s.primary_authenticated_at, s.mfa_authenticated_at,
          EXISTS (SELECT 1 FROM user_totp_factors f WHERE f.user_id = s.user_id AND f.confirmed_at IS NOT NULL)
          OR EXISTS (SELECT 1 FROM user_passkeys p WHERE p.user_id = s.user_id AND p.removed_at IS NULL) AS strong_method
        FROM sessions s WHERE s.id = ${sessionId} AND s.user_id = ${context.userId} AND s.revoked_at IS NULL
      `
    : await getDb()`
        SELECT s.primary_authenticated_at, s.mfa_authenticated_at,
          EXISTS (SELECT 1 FROM app_user_totp_factors f WHERE f.app_user_id = s.app_user_id AND f.confirmed_at IS NOT NULL)
          OR EXISTS (SELECT 1 FROM app_user_passkeys p WHERE p.app_user_id = s.app_user_id AND p.app_id = s.app_id AND p.removed_at IS NULL) AS strong_method
        FROM app_user_sessions s WHERE s.id = ${sessionId} AND s.app_user_id = ${context.appUserId} AND s.app_id = ${context.appId} AND s.revoked_at IS NULL
      `;
  if (!row) return problem(401, "Unauthorized", "Authentication required");
  const primary = (row as { primary_authenticated_at: Date | null }).primary_authenticated_at;
  if (!primary || Date.now() - new Date(primary).getTime() > 10 * 60 * 1000) {
    return passkeyProblem(403, "Sign in again before adding a passkey.", ErrorCodes.PRIMARY_REAUTHENTICATION_REQUIRED);
  }
  if (Boolean((row as { strong_method: boolean }).strong_method)) {
    const mfa = (row as { mfa_authenticated_at: Date | null }).mfa_authenticated_at;
    if (!mfa || Date.now() - new Date(mfa).getTime() > 10 * 60 * 1000) {
      return passkeyProblem(403, "Verify with MFA or a passkey before changing passkeys.", ErrorCodes.PASSKEY_STEP_UP_REQUIRED);
    }
  }
  return null;
}

export function requireFreshPasskeyChange(context: PasskeyContext, sessionId: string): Promise<Response | null> {
  return requireFreshRegistrationSession(context, sessionId);
}

async function accountDetails(context: PasskeyContext): Promise<{ email: string; name: string } | null> {
  const [row] = context.realm === "console"
    ? await getDb()`SELECT email, name FROM users WHERE id = ${context.userId} AND status = 'active' AND disabled_at IS NULL AND deleted_at IS NULL`
    : await getDb()`SELECT email, name FROM app_users WHERE id = ${context.appUserId} AND app_id = ${context.appId} AND status = 'active' AND disabled_at IS NULL AND deleted_at IS NULL`;
  return row ? { email: String((row as { email: string }).email), name: String((row as { name: string }).name) } : null;
}

async function ensureHandle(context: PasskeyContext): Promise<string> {
  const handle = randomToken(32);
  if (context.realm === "console") {
    await getDb()`INSERT INTO user_passkey_handles (user_id, user_handle) VALUES (${context.userId}, ${handle}) ON CONFLICT (user_id) DO NOTHING`;
    const [row] = await getDb()`SELECT user_handle FROM user_passkey_handles WHERE user_id = ${context.userId}`;
    return String((row as { user_handle: string }).user_handle);
  }
  await getDb()`INSERT INTO app_user_passkey_handles (app_user_id, app_id, user_handle) VALUES (${context.appUserId}, ${context.appId}, ${handle}) ON CONFLICT (app_user_id) DO NOTHING`;
  const [row] = await getDb()`SELECT user_handle FROM app_user_passkey_handles WHERE app_user_id = ${context.appUserId} AND app_id = ${context.appId}`;
  return String((row as { user_handle: string }).user_handle);
}

export async function startPasskeyRegistration(
  req: BunRequest,
  context: PasskeyContext,
  sessionId: string,
): Promise<{ ok: true; options: Awaited<ReturnType<typeof generateRegistrationOptions>>; setCookie: string } | { ok: false; response: Response }> {
  const identityId = context.realm === "console" ? context.userId : context.appUserId;
  const rate = await checkRateLimit({
    key: `passkey-registration:${context.realm}:${context.realm === "app" ? context.appId : "console"}:${identityId}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) return { ok: false, response: passkeyProblem(429, "Too many passkey attempts. Try again later.", ErrorCodes.RATE_LIMITED) };
  const freshError = await requireFreshRegistrationSession(context, sessionId);
  if (freshError) return { ok: false, response: freshError };
  const rp = passkeyRp(req);
  if (rp instanceof Response) return { ok: false, response: rp };
  const account = await accountDetails(context);
  if (!account) return { ok: false, response: problem(401, "Unauthorized", "Authentication required") };
  const listed = await listPasskeys(context);
  if (!listed.canRegister) {
    return { ok: false, response: passkeyProblem(409, "Remove a passkey before adding another.", ErrorCodes.PASSKEY_LIMIT_REACHED) };
  }
  const rows = context.realm === "console"
    ? await getDb()`SELECT credential_id FROM user_passkeys WHERE user_id = ${context.userId} AND removed_at IS NULL`
    : await getDb()`SELECT credential_id FROM app_user_passkeys WHERE app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND removed_at IS NULL`;
  const userHandle = await ensureHandle(context);
  const challenge = randomToken(32);
  const options = await generateRegistrationOptions({
    rpName: context.realm === "app" ? `${rp.rpName} app account` : rp.rpName,
    rpID: rp.rpId,
    userID: Uint8Array.from(Buffer.from(userHandle, "hex")),
    userName: account.email,
    userDisplayName: context.realm === "app" ? `${account.name} (${account.email})` : account.name,
    challenge,
    timeout: CEREMONY_MS,
    attestationType: "none",
    excludeCredentials: rows.map((row) => ({ id: String((row as { credential_id: string }).credential_id) })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    supportedAlgorithmIDs: [...SUPPORTED_ALGORITHMS],
  });
  const ceremony = await createCeremony(req, {
    realm: context.realm,
    identityId,
    appId: context.realm === "app" ? context.appId : undefined,
    purpose: "registration",
    challenge: options.challenge,
    origin: rp.origin,
    rpId: rp.rpId,
  });
  await writeAuditEvent({
    actorUserId: context.realm === "console" ? context.userId : undefined,
    action: "passkey.registration_started",
    resourceType: context.realm === "console" ? "console_member" : "app_user",
    resourceId: context.realm === "console" ? context.userId : context.appUserId,
    payload: { realm: context.realm, appId: context.realm === "app" ? context.appId : undefined },
  });
  return { ok: true, options, setCookie: ceremony.setCookie };
}

function normalizeLabel(label: string | undefined, useDefault: boolean): string | null {
  const value = label === undefined && useDefault
    ? `Passkey added ${new Date().toISOString().slice(0, 10)}`
    : label?.trim() ?? "";
  return value.length >= 1 && value.length <= 80 ? value : null;
}

export async function finishPasskeyRegistration(
  req: BunRequest,
  context: PasskeyContext,
  sessionId: string,
  response: RegistrationResponseJSON,
  labelRaw?: string,
): Promise<{ ok: true; passkey: PasskeySummary } | { ok: false; response: Response }> {
  const ceremony = await resolveCeremony(req);
  const identityId = context.realm === "console" ? context.userId : context.appUserId;
  if (!ceremony || ceremony.realm !== context.realm || ceremony.purpose !== "registration" || ceremony.identityId !== identityId || ceremony.appId !== (context.realm === "app" ? context.appId : null)) {
    return { ok: false, response: passkeyProblem(401, "Passkey registration expired. Start again.", ErrorCodes.PASSKEY_REGISTRATION_EXPIRED) };
  }
  const freshError = await requireFreshRegistrationSession(context, sessionId);
  if (freshError) return { ok: false, response: freshError };
  const label = normalizeLabel(labelRaw, true);
  if (!label) return { ok: false, response: passkeyProblem(400, "Passkey name must contain 1 to 80 characters.", ErrorCodes.PASSKEY_NAME_INVALID, "label") };
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: (value) => expectedChallenge(value, ceremony.challengeHash),
      expectedOrigin: ceremony.expectedOrigin,
      expectedRPID: ceremony.expectedRpId,
      expectedType: "webauthn.create",
      requireUserPresence: true,
      requireUserVerification: true,
      supportedAlgorithmIDs: [...SUPPORTED_ALGORITHMS],
    });
  } catch {
    await recordCeremonyFailure(ceremony);
    await writeAuditEvent({ action: "passkey.registration_failed", resourceType: context.realm === "console" ? "console_member" : "app_user", resourceId: identityId, payload: { realm: context.realm, appId: context.realm === "app" ? context.appId : undefined, reason: "verification_failed" } });
    return { ok: false, response: passkeyProblem(400, "Passkey registration could not be verified.", ErrorCodes.PASSKEY_VERIFICATION_FAILED) };
  }
  if (!verification.verified || !verification.registrationInfo) {
    await recordCeremonyFailure(ceremony);
    return { ok: false, response: passkeyProblem(400, "Passkey registration could not be verified.", ErrorCodes.PASSKEY_VERIFICATION_FAILED) };
  }
  const info = verification.registrationInfo;
  const algorithm = Number(decodeCredentialPublicKey(info.credential.publicKey).get(cose.COSEKEYS.alg));
  if (!SUPPORTED_ALGORITHMS.includes(algorithm as (typeof SUPPORTED_ALGORITHMS)[number])) {
    return { ok: false, response: passkeyProblem(400, "This passkey uses an unsupported algorithm.", ErrorCodes.PASSKEY_VERIFICATION_FAILED) };
  }
  const credentialId = String(info.credential.id);
  try {
    const created = await getDb().begin(async (tx) => {
      if (!(await consumeCeremony(ceremony, tx))) return null;
      const [count] = context.realm === "console"
        ? await tx`SELECT COUNT(*)::int AS count FROM user_passkeys WHERE user_id = ${context.userId} AND removed_at IS NULL`
        : await tx`SELECT COUNT(*)::int AS count FROM app_user_passkeys WHERE app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND removed_at IS NULL`;
      if (Number((count as { count: number }).count) >= MAX_PASSKEYS) return null;
      await tx`INSERT INTO passkey_credential_registry (credential_id, realm) VALUES (${credentialId}, ${context.realm})`;
      const publicKey = Buffer.from(info.credential.publicKey).toString("base64");
      const transports = (info.credential.transports ?? []) as string[];
      const backupEligible = info.credentialDeviceType === "multiDevice";
      const [row] = context.realm === "console"
        ? await tx`
            INSERT INTO user_passkeys (
              user_id, credential_id, public_key, algorithm, signature_counter, label,
              transports, aaguid, backup_eligible, backup_state
            ) VALUES (
              ${context.userId}, ${credentialId}, ${publicKey}, ${algorithm}, ${info.credential.counter},
              ${label}, ${pgTextArray(transports)}, ${info.aaguid}, ${backupEligible}, ${info.credentialBackedUp}
            ) RETURNING id, label, created_at, last_used_at, backup_eligible, backup_state
          `
        : await tx`
            INSERT INTO app_user_passkeys (
              app_user_id, app_id, credential_id, public_key, algorithm, signature_counter, label,
              transports, aaguid, backup_eligible, backup_state
            ) VALUES (
              ${context.appUserId}, ${context.appId}, ${credentialId}, ${publicKey}, ${algorithm},
              ${info.credential.counter}, ${label}, ${pgTextArray(transports)}, ${info.aaguid}, ${backupEligible},
              ${info.credentialBackedUp}
            ) RETURNING id, label, created_at, last_used_at, backup_eligible, backup_state
          `;
      await writeAuditEvent({
        actorUserId: context.realm === "console" ? context.userId : undefined,
        action: "passkey.registration_succeeded",
        resourceType: context.realm === "console" ? "console_member" : "app_user",
        resourceId: identityId,
        payload: { realm: context.realm, appId: context.realm === "app" ? context.appId : undefined, backupEligible, backedUp: info.credentialBackedUp },
      }, tx);
      return mapSummary(row as Record<string, unknown>);
    });
    if (!created) return { ok: false, response: passkeyProblem(409, "Passkey registration state changed. Start again.", ErrorCodes.PASSKEY_STATE_CONFLICT) };
    return { ok: true, passkey: created };
  } catch {
    return { ok: false, response: passkeyProblem(409, "This passkey is already registered or registration state changed.", ErrorCodes.PASSKEY_STATE_CONFLICT) };
  }
}

async function decoyCredentialIds(realIds: string[], scope: string): Promise<string[]> {
  const values = await Promise.all(Array.from(
    { length: MAX_PASSKEYS },
    (_, index) => deriveOpaquePublicValue("passkey-decoy", `${scope}:${index}`),
  ));
  realIds.slice(0, MAX_PASSKEYS).forEach((id, index) => { values[index] = id; });
  return values.sort();
}

export async function startPasskeyAuthentication(
  req: BunRequest,
  input: { realm: Realm; email?: string; appId?: string; identityId?: string; purpose?: Purpose; returnPath?: string | null },
): Promise<{ ok: true; options: PublicKeyCredentialRequestOptionsJSON; setCookie: string } | { ok: false; response: Response }> {
  const purpose = input.purpose ?? "authentication";
  const rp = passkeyRp(req);
  if (rp instanceof Response) return { ok: false, response: rp };
  const rate = await checkRateLimit({
    key: `passkey-options:${input.realm}:${input.appId ?? "console"}:${clientIp(req)}:${normalizeEmail(input.email ?? "")}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) return { ok: false, response: passkeyProblem(429, "Too many passkey attempts. Try again later.", ErrorCodes.RATE_LIMITED) };

  let identityId = input.identityId ?? null;
  if (!identityId) {
    if (validateEmail(input.email ?? "").length === 0) {
      const email = normalizeEmail(input.email ?? "");
      const [row] = input.realm === "console"
        ? await getDb()`SELECT id FROM users WHERE lower(email) = ${email} AND status = 'active' AND disabled_at IS NULL AND deleted_at IS NULL AND (locked_until IS NULL OR locked_until <= NOW())`
        : await getDb()`SELECT id FROM app_users WHERE app_id = ${input.appId!} AND lower(email) = ${email} AND status = 'active' AND disabled_at IS NULL AND deleted_at IS NULL AND (locked_until IS NULL OR locked_until <= NOW())`;
      if (row) identityId = String((row as { id: string }).id);
    }
  }
  const rows = input.realm === "console"
    ? await getDb()`SELECT credential_id FROM user_passkeys WHERE user_id = ${identityId}::uuid AND removed_at IS NULL ORDER BY created_at DESC`
    : await getDb()`SELECT credential_id FROM app_user_passkeys WHERE app_user_id = ${identityId}::uuid AND app_id = ${input.appId!} AND removed_at IS NULL ORDER BY created_at DESC`;
  const challenge = randomToken(32);
  const decoyScope = `${input.realm}:${input.appId ?? "console"}:${normalizeEmail(input.email ?? input.identityId ?? "unknown")}`;
  const allowCredentialIds = await decoyCredentialIds(
    rows.map((row) => String((row as { credential_id: string }).credential_id)),
    decoyScope,
  );
  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    challenge,
    timeout: CEREMONY_MS,
    userVerification: "required",
    allowCredentials: allowCredentialIds.map((id) => ({ id })),
  });
  const ceremony = await createCeremony(req, {
    realm: input.realm,
    identityId,
    appId: input.appId,
    purpose,
    challenge: options.challenge,
    origin: rp.origin,
    rpId: rp.rpId,
    returnPath: input.returnPath,
  });
  return { ok: true, options, setCookie: ceremony.setCookie };
}

async function credentialForCeremony(ceremony: Ceremony, credentialId: string): Promise<CredentialRow | null> {
  if (!ceremony.identityId) return null;
  const [row] = ceremony.realm === "console"
    ? await getDb()`
        SELECT p.id, p.user_id AS identity_id, NULL::uuid AS app_id, p.credential_id, p.public_key,
          p.signature_counter, p.transports, p.backup_eligible
        FROM user_passkeys p JOIN passkey_credential_registry r ON r.credential_id = p.credential_id
        WHERE p.user_id = ${ceremony.identityId} AND p.credential_id = ${credentialId}
          AND p.removed_at IS NULL AND r.active = TRUE
      `
    : await getDb()`
        SELECT p.id, p.app_user_id AS identity_id, p.app_id, p.credential_id, p.public_key,
          p.signature_counter, p.transports, p.backup_eligible
        FROM app_user_passkeys p JOIN passkey_credential_registry r ON r.credential_id = p.credential_id
        WHERE p.app_user_id = ${ceremony.identityId} AND p.app_id = ${ceremony.appId!}
          AND p.credential_id = ${credentialId} AND p.removed_at IS NULL AND r.active = TRUE
      `;
  if (!row) return null;
  const r = row as CredentialRow;
  return { ...r, id: String(r.id), identity_id: String(r.identity_id), app_id: r.app_id ? String(r.app_id) : null };
}

async function expectedUserHandle(ceremony: Ceremony): Promise<string | null> {
  if (!ceremony.identityId) return null;
  const [row] = ceremony.realm === "console"
    ? await getDb()`SELECT user_handle FROM user_passkey_handles WHERE user_id = ${ceremony.identityId}`
    : await getDb()`SELECT user_handle FROM app_user_passkey_handles WHERE app_user_id = ${ceremony.identityId} AND app_id = ${ceremony.appId!}`;
  if (!row) return null;
  return Buffer.from(String((row as { user_handle: string }).user_handle), "hex").toString("base64url");
}

async function respondToCounterAnomaly(ceremony: Ceremony, credential: CredentialRow): Promise<void> {
  if (!ceremony.identityId) return;
  await getDb().begin(async (tx) => {
    if (ceremony.realm === "console") {
      await tx`UPDATE user_passkeys SET removed_at = NOW(), updated_at = NOW() WHERE id = ${credential.id} AND removed_at IS NULL`;
      await tx`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${ceremony.identityId} AND revoked_at IS NULL`;
    } else {
      await tx`UPDATE app_user_passkeys SET removed_at = NOW(), updated_at = NOW() WHERE id = ${credential.id} AND app_id = ${ceremony.appId!} AND removed_at IS NULL`;
      await tx`UPDATE app_user_sessions SET revoked_at = NOW() WHERE app_user_id = ${ceremony.identityId} AND app_id = ${ceremony.appId!} AND revoked_at IS NULL`;
      await tx`UPDATE oauth_authorization_codes SET used_at = NOW() WHERE app_user_id = ${ceremony.identityId} AND app_id = ${ceremony.appId!} AND used_at IS NULL`;
      await tx`UPDATE oauth_access_tokens SET revoked_at = NOW() WHERE app_user_id = ${ceremony.identityId} AND app_id = ${ceremony.appId!} AND revoked_at IS NULL`;
      await tx`UPDATE oauth_refresh_tokens SET revoked_at = NOW() WHERE app_user_id = ${ceremony.identityId} AND app_id = ${ceremony.appId!} AND revoked_at IS NULL`;
    }
    await tx`UPDATE passkey_credential_registry SET active = FALSE, removed_at = NOW() WHERE credential_id = ${credential.credential_id}`;
    await writeAuditEvent({
      action: "passkey.suspicious_counter",
      resourceType: ceremony.realm === "console" ? "console_member" : "app_user",
      resourceId: ceremony.identityId!,
      payload: { realm: ceremony.realm, appId: ceremony.appId ?? undefined, reason: "counter_not_increased" },
    }, tx);
  });
}

export async function finishPasskeyAuthentication(
  req: BunRequest,
  response: AuthenticationResponseJSON,
): Promise<{ ok: true; setCookie?: string; returnPath: string; stepUp: boolean; context: PasskeyContext } | { ok: false; response: Response }> {
  const ceremony = await resolveCeremony(req);
  const generic = () => passkeyProblem(401, "Passkey sign-in could not be completed.", ErrorCodes.PASSKEY_VERIFICATION_FAILED);
  if (!ceremony || (ceremony.purpose !== "authentication" && ceremony.purpose !== "step_up")) {
    return { ok: false, response: passkeyProblem(401, "Passkey authentication expired. Start again.", ErrorCodes.PASSKEY_AUTHENTICATION_EXPIRED) };
  }
  const rate = await checkRateLimit({ key: `passkey-verify:${ceremony.realm}:${ceremony.id}:${clientIp(req)}`, limit: 5, windowMs: CEREMONY_MS });
  if (!rate.allowed) {
    await recordCeremonyFailure(ceremony);
    return { ok: false, response: passkeyProblem(429, "Too many passkey attempts. Start again.", ErrorCodes.RATE_LIMITED) };
  }
  const credential = await credentialForCeremony(ceremony, response.id);
  if (!credential) {
    await recordCeremonyFailure(ceremony);
    await writeAuditEvent({ action: "passkey.authentication_failed", resourceType: ceremony.realm === "console" ? "console_member" : "app_user", resourceId: ceremony.identityId ?? undefined, payload: { realm: ceremony.realm, appId: ceremony.appId ?? undefined, reason: "unknown_credential" } });
    return { ok: false, response: generic() };
  }
  const handle = await expectedUserHandle(ceremony);
  if (response.response.userHandle && response.response.userHandle !== handle) {
    await recordCeremonyFailure(ceremony);
    return { ok: false, response: generic() };
  }
  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (value) => expectedChallenge(value, ceremony.challengeHash),
      expectedOrigin: ceremony.expectedOrigin,
      expectedRPID: ceremony.expectedRpId,
      expectedType: "webauthn.get",
      requireUserVerification: true,
      credential: {
        id: credential.credential_id,
        publicKey: Uint8Array.from(Buffer.from(credential.public_key, "base64")),
        // Verify the signature first, then apply the RP counter policy below. The library checks
        // counters before signature validity when a stored counter is supplied.
        counter: 0,
        transports: (credential.transports ?? []) as AuthenticatorTransportFuture[],
      },
    });
  } catch {
    await recordCeremonyFailure(ceremony);
    await writeAuditEvent({ action: "passkey.authentication_failed", resourceType: ceremony.realm === "console" ? "console_member" : "app_user", resourceId: ceremony.identityId ?? undefined, payload: { realm: ceremony.realm, appId: ceremony.appId ?? undefined, reason: "verification_failed" } });
    return { ok: false, response: generic() };
  }
  if (!verification.verified) {
    await recordCeremonyFailure(ceremony);
    return { ok: false, response: generic() };
  }
  const info = verification.authenticationInfo;
  const storedCounter = Number(credential.signature_counter);
  if ((storedCounter > 0 || info.newCounter > 0) && info.newCounter <= storedCounter) {
    await consumeCeremony(ceremony, getDb());
    await respondToCounterAnomaly(ceremony, credential);
    return { ok: false, response: generic() };
  }
  if ((info.credentialDeviceType === "multiDevice") !== credential.backup_eligible) {
    await recordCeremonyFailure(ceremony);
    return { ok: false, response: generic() };
  }
  const context: PasskeyContext = ceremony.realm === "console"
    ? { realm: "console", userId: ceremony.identityId! }
    : { realm: "app", appUserId: ceremony.identityId!, appId: ceremony.appId! };
  const currentSession = ceremony.purpose === "step_up"
    ? ceremony.realm === "console"
      ? await resolveSession(req)
      : await resolveAppSessionForApp(req, ceremony.appId)
    : null;
  if (ceremony.purpose === "step_up" && (!currentSession || (ceremony.realm === "console" ? currentSession.userId !== ceremony.identityId : currentSession.appUserId !== ceremony.identityId))) {
    return { ok: false, response: problem(401, "Unauthorized", "Authentication required") };
  }
  const preparedConsole = ceremony.purpose === "authentication" && ceremony.realm === "console" ? await prepareSession(req) : null;
  const preparedApp = ceremony.purpose === "authentication" && ceremony.realm === "app" ? await prepareAppSession(req) : null;
  const now = new Date();
  const authority = await getDb().begin(async (tx) => {
    if (ceremony.realm === "app") {
      const [app] = await tx`SELECT status FROM apps WHERE id = ${ceremony.appId!} FOR SHARE`;
      if (!app || String((app as { status: string }).status) !== "active") return null;
    }
    const [account] = ceremony.realm === "console"
      ? await tx`SELECT status, disabled_at, locked_until, deleted_at FROM users WHERE id = ${ceremony.identityId!} FOR UPDATE`
      : await tx`SELECT status, disabled_at, locked_until, deleted_at, email FROM app_users WHERE id = ${ceremony.identityId!} AND app_id = ${ceremony.appId!} FOR UPDATE`;
    if (!account) return null;
    const state = account as AccountLifecycleRow & { status: string; email?: string };
    if (state.status !== "active" || !accountCanAuthenticate(state)) return null;
    const [lockedCredential] = ceremony.realm === "console"
      ? await tx`SELECT signature_counter FROM user_passkeys WHERE id = ${credential.id} AND removed_at IS NULL FOR UPDATE`
      : await tx`SELECT signature_counter FROM app_user_passkeys WHERE id = ${credential.id} AND app_id = ${ceremony.appId!} AND removed_at IS NULL FOR UPDATE`;
    if (!lockedCredential || Number((lockedCredential as { signature_counter: number }).signature_counter) !== Number(credential.signature_counter)) return null;
    if (!(await consumeCeremony(ceremony, tx))) return null;
    if (ceremony.realm === "console") {
      await tx`UPDATE user_passkeys SET signature_counter = ${info.newCounter}, last_used_at = NOW(), updated_at = NOW(), backup_state = ${info.credentialBackedUp} WHERE id = ${credential.id}`;
    } else {
      await tx`UPDATE app_user_passkeys SET signature_counter = ${info.newCounter}, last_used_at = NOW(), updated_at = NOW(), backup_state = ${info.credentialBackedUp} WHERE id = ${credential.id}`;
    }
    if (ceremony.purpose === "step_up") {
      if (ceremony.realm === "console") {
        await tx`UPDATE sessions SET mfa_authenticated_at = NOW(), authentication_method = 'passkey' WHERE id = ${currentSession!.sessionId} AND user_id = ${ceremony.identityId!} AND revoked_at IS NULL`;
      } else {
        await tx`UPDATE app_user_sessions SET mfa_authenticated_at = NOW(), authentication_method = 'passkey' WHERE id = ${currentSession!.sessionId} AND app_user_id = ${ceremony.identityId!} AND app_id = ${ceremony.appId!} AND revoked_at IS NULL`;
      }
      return { token: null, expiresAt: null, email: state.email ?? null };
    }
    if (ceremony.realm === "console") {
      await tx`UPDATE users SET failed_sign_in_count = 0, failed_sign_in_window_started_at = NULL, locked_until = NULL, updated_at = NOW() WHERE id = ${ceremony.identityId!}`;
      const session = await insertSession(tx, ceremony.identityId!, preparedConsole!, { primaryAuthenticatedAt: now, mfaAuthenticatedAt: now, authenticationMethod: "passkey" });
      return { ...session, email: null };
    }
    await tx`UPDATE app_users SET failed_sign_in_count = 0, failed_sign_in_window_started_at = NULL, locked_until = NULL, updated_at = NOW() WHERE id = ${ceremony.identityId!} AND app_id = ${ceremony.appId!}`;
    const session = await insertAppSession(tx, ceremony.identityId!, ceremony.appId!, preparedApp!, { primaryAuthenticatedAt: now, mfaAuthenticatedAt: now, authenticationMethod: "passkey" });
    return { ...session, email: state.email ?? null };
  });
  if (!authority) return { ok: false, response: generic() };
  if (ceremony.realm === "app" && authority.email) await ensureGroupMemberForAppUser(ceremony.identityId!, ceremony.appId!, authority.email);
  await writeAuditEvent({
    actorUserId: ceremony.realm === "console" ? ceremony.identityId! : undefined,
    action: ceremony.purpose === "step_up" ? "passkey.step_up_succeeded" : "passkey.authentication_succeeded",
    resourceType: ceremony.realm === "console" ? "console_member" : "app_user",
    resourceId: ceremony.identityId!,
    payload: { realm: ceremony.realm, appId: ceremony.appId ?? undefined, backedUp: info.credentialBackedUp },
  });
  if (ceremony.purpose === "authentication") {
    await writeAuditEvent({ actorUserId: ceremony.realm === "console" ? ceremony.identityId! : undefined, action: ceremony.realm === "console" ? "auth.login_succeeded" : "auth.app_login_succeeded", resourceType: ceremony.realm === "console" ? "auth" : "app", resourceId: ceremony.realm === "app" ? ceremony.appId! : undefined, payload: ceremony.realm === "console" ? { audience: "console", passkey: true } : { appUserId: ceremony.identityId!, passkey: true } });
  }
  return {
    ok: true,
    setCookie: ceremony.purpose === "authentication"
      ? ceremony.realm === "console"
        ? sessionCookieHeader(authority.token!, authority.expiresAt!)
        : appSessionCookieHeader(authority.token!, authority.expiresAt!)
      : undefined,
    returnPath: safeReturnPath(ceremony.returnPath, ceremony.realm === "app" ? "/oauth/resume" : "/"),
    stepUp: ceremony.purpose === "step_up",
    context,
  };
}

export async function renamePasskey(context: PasskeyContext, passkeyId: string, labelRaw: string): Promise<boolean | Response> {
  const label = normalizeLabel(labelRaw, false);
  if (!label) return passkeyProblem(400, "Passkey name must contain 1 to 80 characters.", ErrorCodes.PASSKEY_NAME_INVALID, "label");
  const rows = context.realm === "console"
    ? await getDb()`UPDATE user_passkeys SET label = ${label}, updated_at = NOW() WHERE id = ${passkeyId} AND user_id = ${context.userId} AND removed_at IS NULL RETURNING id`
    : await getDb()`UPDATE app_user_passkeys SET label = ${label}, updated_at = NOW() WHERE id = ${passkeyId} AND app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND removed_at IS NULL RETURNING id`;
  if (!rows[0]) return false;
  await writeAuditEvent({ actorUserId: context.realm === "console" ? context.userId : undefined, action: "passkey.renamed", resourceType: context.realm === "console" ? "console_member" : "app_user", resourceId: context.realm === "console" ? context.userId : context.appUserId, payload: { realm: context.realm, appId: context.realm === "app" ? context.appId : undefined } });
  return true;
}

export async function removePasskey(context: PasskeyContext, passkeyId: string, currentSessionId: string): Promise<boolean> {
  const removed = await getDb().begin(async (tx) => {
    const [row] = context.realm === "console"
      ? await tx`UPDATE user_passkeys SET removed_at = NOW(), updated_at = NOW() WHERE id = ${passkeyId} AND user_id = ${context.userId} AND removed_at IS NULL RETURNING credential_id`
      : await tx`UPDATE app_user_passkeys SET removed_at = NOW(), updated_at = NOW() WHERE id = ${passkeyId} AND app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND removed_at IS NULL RETURNING credential_id`;
    if (!row) return false;
    await tx`UPDATE passkey_credential_registry SET active = FALSE, removed_at = NOW() WHERE credential_id = ${String((row as { credential_id: string }).credential_id)}`;
    if (context.realm === "console") {
      await tx`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${context.userId} AND id != ${currentSessionId} AND revoked_at IS NULL`;
      await tx`UPDATE user_passkey_ceremonies SET consumed_at = NOW() WHERE user_id = ${context.userId} AND consumed_at IS NULL`;
    } else {
      await tx`UPDATE app_user_sessions SET revoked_at = NOW() WHERE app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND id != ${currentSessionId} AND revoked_at IS NULL`;
      await tx`UPDATE oauth_authorization_codes SET used_at = NOW() WHERE app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND used_at IS NULL`;
      await tx`UPDATE oauth_access_tokens SET revoked_at = NOW() WHERE app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND revoked_at IS NULL`;
      await tx`UPDATE oauth_refresh_tokens SET revoked_at = NOW() WHERE app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND revoked_at IS NULL`;
      await tx`UPDATE app_user_passkey_ceremonies SET consumed_at = NOW() WHERE app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND consumed_at IS NULL`;
    }
    await writeAuditEvent({ actorUserId: context.realm === "console" ? context.userId : undefined, action: "passkey.removed", resourceType: context.realm === "console" ? "console_member" : "app_user", resourceId: context.realm === "console" ? context.userId : context.appUserId, payload: { realm: context.realm, appId: context.realm === "app" ? context.appId : undefined } }, tx);
    return true;
  });
  return removed;
}

export async function resetPasskeys(tx: SQL, context: PasskeyContext): Promise<number> {
  const rows = context.realm === "console"
    ? await tx`UPDATE user_passkeys SET removed_at = NOW(), updated_at = NOW() WHERE user_id = ${context.userId} AND removed_at IS NULL RETURNING credential_id`
    : await tx`UPDATE app_user_passkeys SET removed_at = NOW(), updated_at = NOW() WHERE app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND removed_at IS NULL RETURNING credential_id`;
  for (const row of rows) {
    await tx`UPDATE passkey_credential_registry SET active = FALSE, removed_at = NOW() WHERE credential_id = ${String((row as { credential_id: string }).credential_id)}`;
  }
  if (context.realm === "console") await tx`UPDATE user_passkey_ceremonies SET consumed_at = NOW() WHERE user_id = ${context.userId} AND consumed_at IS NULL`;
  else await tx`UPDATE app_user_passkey_ceremonies SET consumed_at = NOW() WHERE app_user_id = ${context.appUserId} AND app_id = ${context.appId} AND consumed_at IS NULL`;
  return rows.length;
}

export async function hasConsolePasskeys(userId: string): Promise<boolean> {
  const [row] = await getDb()`SELECT 1 FROM user_passkeys WHERE user_id = ${userId} AND removed_at IS NULL LIMIT 1`;
  return Boolean(row);
}
