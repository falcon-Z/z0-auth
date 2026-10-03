import { ErrorCodes } from "@z0/contracts/errors";
import { normalizeEmail } from "@z0/contracts/validation";

import { getDb } from "./db";
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
): Promise<{ id: string; app_user_id: string | null; available: boolean } | null> {
  const [row] = await getDb()`
    SELECT i.id, b.id AS app_user_id,
      (c.status = 'active' AND c.disabled_at IS NULL AND c.deleted_at IS NULL
        AND COALESCE(m.status = 'active', FALSE)) AS available
    FROM apps a JOIN accounts c ON c.account_domain_id = a.account_domain_id
    JOIN app_user_identities i ON i.account_id = c.id AND i.account_domain_id = c.account_domain_id
    JOIN identity_providers p ON p.id = ${providerId}
    LEFT JOIN app_account_bindings b ON b.app_id = a.id AND b.account_id = c.id
    LEFT JOIN application_memberships m ON m.subject_id = b.id
    WHERE a.id = ${appId} AND a.status = 'active'
      AND i.issuer = COALESCE(NULLIF(p.issuer, ''), 'urn:z0-auth:legacy-provider:' || p.id)
      AND i.provider_subject = ${subject}
    LIMIT 1
  `;
  if (!row) return null;
  return { id: String(row.id), app_user_id: row.app_user_id ? String(row.app_user_id) : null, available: Boolean(row.available) };
}

async function findAppUserByEmail(
  appId: string,
  email: string,
): Promise<{ id: string | null; email_verified_at: Date | null; password_hash: string | null; available: boolean } | null> {
  const [row] = await getDb()`
    SELECT b.id, c.email_verified_at, c.password_hash,
      (c.status = 'active' AND c.disabled_at IS NULL AND c.deleted_at IS NULL
        AND COALESCE(m.status = 'active', FALSE)) AS available
    FROM apps a JOIN accounts c ON c.account_domain_id = a.account_domain_id
    LEFT JOIN app_account_bindings b ON b.app_id = a.id AND b.account_id = c.id
    LEFT JOIN application_memberships m ON m.subject_id = b.id
    WHERE a.id = ${appId} AND a.status = 'active' AND lower(c.email) = ${email}
    LIMIT 1
  `;
  if (!row) return null;
  return {
    id: row.id ? String(row.id) : null,
    email_verified_at: row.email_verified_at,
    password_hash: row.password_hash,
    available: Boolean(row.available),
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
    FROM app_user_identities i JOIN apps a ON a.account_domain_id = i.account_domain_id
    JOIN identity_providers p ON p.id = ${providerId}
    WHERE a.id = ${appId}
      AND i.issuer = COALESCE(NULLIF(p.issuer, ''), 'urn:z0-auth:legacy-provider:' || p.id)
      AND lower(i.provider_email) = ${email}
      AND i.provider_subject <> ${subject}
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
    if (!existing.available || !existing.app_user_id) {
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
      if (!appUser.available || !appUser.id) {
        return { ok: false, response: problem(401, "Unauthorized", "Sign-in could not be completed", {
          errors: [{ field: "_auth", code: ErrorCodes.FEDERATION_FAILED, message: "Sign-in could not be completed" }],
        }) };
      }
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

      return { ok: true, appUserId: appUser.id, created: false };
    }
  }

  const displayName = profile.name?.trim() || email?.split("@")[0] || "User";
  const insertEmail = email ?? `${profile.subject}@federated.local`;

  const appUserId = await getDb().begin(async (tx) => {
    const [created] = await tx`
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

    await tx`
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
    return appUserId;
  });

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
