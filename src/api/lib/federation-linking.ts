import { ErrorCodes } from "@z0/contracts/errors";
import { normalizeEmail } from "@z0/contracts/validation";

import { getDb } from "./db";
import { ensureGroupMemberForAppUser } from "./group-sso";
import { problem } from "./http";

export type NormalizedIdpProfile = {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  raw: Record<string, unknown>;
};

export type LinkFederationResult =
  | { ok: true; appUserId: string; created: boolean }
  | { ok: false; response: Response };

async function findIdentityBySubject(
  appId: string,
  providerId: string,
  subject: string,
): Promise<{ id: string; app_user_id: string; app_id: string; available: boolean } | null> {
  const [row] = await getDb()`
    SELECT i.id, i.app_user_id, i.app_id,
      (u.disabled_at IS NULL AND u.deleted_at IS NULL) AS available
    FROM app_user_identities i
    JOIN app_users u ON u.id = i.app_user_id AND u.app_id = i.app_id
    WHERE i.app_id = ${appId}
      AND i.identity_provider_id = ${providerId}
      AND i.provider_subject = ${subject}
    LIMIT 1
  `;
  if (!row) return null;
  const r = row as { id: string; app_user_id: string; app_id: string; available: boolean };
  return { id: String(r.id), app_user_id: String(r.app_user_id), app_id: String(r.app_id), available: Boolean(r.available) };
}

async function findAppUserByEmail(
  appId: string,
  email: string,
): Promise<{ id: string; email_verified_at: Date | null; password_hash: string | null } | null> {
  const [row] = await getDb()`
    SELECT id, email_verified_at, password_hash
    FROM app_users
    WHERE app_id = ${appId}
      AND lower(email) = ${email}
      AND status = 'active'
      AND disabled_at IS NULL AND deleted_at IS NULL
    LIMIT 1
  `;
  if (!row) return null;
  const r = row as { id: string; email_verified_at: Date | null; password_hash: string | null };
  return {
    id: String(r.id),
    email_verified_at: r.email_verified_at,
    password_hash: r.password_hash,
  };
}

async function emailLinkedToOtherSubject(
  appId: string,
  providerId: string,
  email: string,
  subject: string,
): Promise<boolean> {
  const [row] = await getDb()`
    SELECT 1
    FROM app_user_identities
    WHERE app_id = ${appId}
      AND identity_provider_id = ${providerId}
      AND lower(provider_email) = ${email}
      AND provider_subject <> ${subject}
    LIMIT 1
  `;
  return Boolean(row);
}

export async function linkFederationIdentity(options: {
  appId: string;
  providerId: string;
  profile: NormalizedIdpProfile;
}): Promise<LinkFederationResult> {
  const { appId, providerId, profile } = options;
  const email = profile.email ? normalizeEmail(profile.email) : null;

  const existing = await findIdentityBySubject(appId, providerId, profile.subject);
  if (existing) {
    if (!existing.available) {
      return { ok: false, response: problem(401, "Unauthorized", "Sign-in could not be completed", {
        errors: [{ field: "_auth", code: ErrorCodes.FEDERATION_FAILED, message: "Sign-in could not be completed" }],
      }) };
    }
    await getDb()`
      UPDATE app_users SET locked_until = NULL, failed_sign_in_count = 0,
        failed_sign_in_window_started_at = NULL, updated_at = NOW()
      WHERE id = ${existing.app_user_id} AND app_id = ${appId}
    `;
    await getDb()`
      UPDATE app_user_identities
      SET last_used_at = NOW(),
          provider_email = COALESCE(${email}, provider_email),
          email_verified = ${profile.emailVerified},
          profile = ${JSON.stringify(profile.raw)}::jsonb
      WHERE id = ${existing.id}
    `;
    await ensureGroupMemberForAppUser(
      existing.app_user_id,
      appId,
      email ?? profile.email ?? `${profile.subject}@federated.local`,
    );
    return { ok: true, appUserId: existing.app_user_id, created: false };
  }

  if (email) {
    if (await emailLinkedToOtherSubject(appId, providerId, email, profile.subject)) {
      return {
        ok: false,
        response: problem(409, "Conflict", "Email already linked to another account", {
          errors: [{ field: "_auth", code: ErrorCodes.FEDERATION_EMAIL_CONFLICT, message: "This email is already linked with a different sign-in method" }],
        }),
      };
    }

    const appUser = await findAppUserByEmail(appId, email);
    if (appUser) {
      const localVerified = Boolean(appUser.email_verified_at);
      if (!localVerified && !profile.emailVerified) {
        return {
          ok: false,
          response: problem(409, "Conflict", "Verify your email before linking", {
            errors: [{
              field: "_auth",
              code: ErrorCodes.FEDERATION_EMAIL_CONFLICT,
              message: "Sign in with your password first to link this account",
            }],
          }),
        };
      }

      await getDb()`
        INSERT INTO app_user_identities (
          app_user_id,
          app_id,
          identity_provider_id,
          provider_subject,
          provider_email,
          email_verified,
          profile
        )
        VALUES (
          ${appUser.id},
          ${appId},
          ${providerId},
          ${profile.subject},
          ${email},
          ${profile.emailVerified},
          ${JSON.stringify(profile.raw)}::jsonb
        )
      `;

      if (profile.emailVerified && !localVerified) {
        await getDb()`
          UPDATE app_users SET email_verified_at = NOW(), updated_at = NOW()
          WHERE id = ${appUser.id} AND email_verified_at IS NULL
        `;
      }

      await getDb()`
        UPDATE app_users SET locked_until = NULL, failed_sign_in_count = 0,
          failed_sign_in_window_started_at = NULL, updated_at = NOW()
        WHERE id = ${appUser.id} AND app_id = ${appId}
      `;

      await ensureGroupMemberForAppUser(appUser.id, appId, email);
      return { ok: true, appUserId: appUser.id, created: false };
    }
  }

  const displayName = profile.name?.trim() || email?.split("@")[0] || "User";
  const insertEmail = email ?? `${profile.subject}@federated.local`;

  const [created] = await getDb()`
    INSERT INTO app_users (
      app_id,
      email,
      name,
      password_hash,
      status,
      email_verified_at
    )
    VALUES (
      ${appId},
      ${insertEmail},
      ${displayName},
      NULL,
      'active',
      ${profile.emailVerified ? new Date() : null}
    )
    RETURNING id
  `;
  const appUserId = String((created as { id: string }).id);

  await getDb()`
    INSERT INTO app_user_identities (
      app_user_id,
      app_id,
      identity_provider_id,
      provider_subject,
      provider_email,
      email_verified,
      profile
    )
    VALUES (
      ${appUserId},
      ${appId},
      ${providerId},
      ${profile.subject},
      ${email},
      ${profile.emailVerified},
      ${JSON.stringify(profile.raw)}::jsonb
    )
  `;

  await ensureGroupMemberForAppUser(appUserId, appId, insertEmail);
  return { ok: true, appUserId, created: true };
}

export async function storeProviderTokens(options: {
  appUserId: string;
  providerId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string | null;
  expiresIn: number | null;
}): Promise<void> {
  const [identity] = await getDb()`
    SELECT id FROM app_user_identities
    WHERE app_user_id = ${options.appUserId}
      AND identity_provider_id = ${options.providerId}
    LIMIT 1
  `;
  if (!identity) return;

  const identityId = String((identity as { id: string }).id);
  const { encryptSecret } = await import("./settings-crypto");
  const accessCiphertext = await encryptSecret(options.accessToken);
  const refreshCiphertext = options.refreshToken ? await encryptSecret(options.refreshToken) : null;
  const expiresAt =
    options.expiresIn && options.expiresIn > 0
      ? new Date(Date.now() + options.expiresIn * 1000)
      : null;

  await getDb()`
    UPDATE app_user_provider_tokens
    SET revoked_at = NOW(), updated_at = NOW()
    WHERE app_user_identity_id = ${identityId} AND revoked_at IS NULL
  `;

  await getDb()`
    INSERT INTO app_user_provider_tokens (
      app_user_identity_id,
      access_token_ciphertext,
      refresh_token_ciphertext,
      token_type,
      scope,
      expires_at
    )
    VALUES (
      ${identityId},
      ${accessCiphertext},
      ${refreshCiphertext},
      ${options.tokenType || "Bearer"},
      ${options.scope},
      ${expiresAt}
    )
  `;
}

export async function findIdentityIdForUserProvider(
  appUserId: string,
  providerId: string,
): Promise<string | null> {
  const [row] = await getDb()`
    SELECT id FROM app_user_identities
    WHERE app_user_id = ${appUserId} AND identity_provider_id = ${providerId}
    LIMIT 1
  `;
  return row ? String((row as { id: string }).id) : null;
}
