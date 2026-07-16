import { ErrorCodes } from "@z0/contracts/errors";
import type { FederationUserTokenResponse } from "@z0/contracts/federation";

import { writeAuditEvent } from "./audit";
import { getDb } from "./db";
import { problem } from "./http";
import { refreshUpstreamToken } from "./federation-broker";
import { findIdentityIdForUserProvider } from "./federation-linking";
import { getProviderSecrets, type ProviderSecrets } from "./federation-providers";
import { decryptSecret, encryptSecret } from "./settings-crypto";

const REFRESH_BUFFER_MS = 60_000;

type StoredTokenRow = {
  id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_type: string;
  scope: string | null;
  expires_at: Date | null;
  revoked_at: Date | null;
};

function tokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - REFRESH_BUFFER_MS <= Date.now();
}

async function loadStoredToken(identityId: string): Promise<StoredTokenRow | null> {
  const [row] = await getDb()`
    SELECT id, access_token_ciphertext, refresh_token_ciphertext, token_type, scope, expires_at, revoked_at
    FROM app_user_provider_tokens
    WHERE app_user_identity_id = ${identityId}
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return row ? (row as StoredTokenRow) : null;
}

async function persistRefreshedTokens(options: {
  identityId: string;
  tokens: {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
  };
}): Promise<void> {
  const accessCiphertext = await encryptSecret(options.tokens.access_token);
  const refreshCiphertext = options.tokens.refresh_token
    ? await encryptSecret(options.tokens.refresh_token)
    : null;
  const expiresAt =
    options.tokens.expires_in && options.tokens.expires_in > 0
      ? new Date(Date.now() + options.tokens.expires_in * 1000)
      : null;

  await getDb()`
    UPDATE app_user_provider_tokens
    SET revoked_at = NOW(), updated_at = NOW()
    WHERE app_user_identity_id = ${options.identityId} AND revoked_at IS NULL
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
      ${options.identityId},
      ${accessCiphertext},
      ${refreshCiphertext},
      ${options.tokens.token_type ?? "Bearer"},
      ${options.tokens.scope ?? null},
      ${expiresAt}
    )
  `;
}

async function resolveUserProvider(
  appId: string,
  userId: string,
  providerId: string,
): Promise<
  | { ok: true; identityId: string; secrets: ProviderSecrets }
  | { ok: false; response: Response }
> {
  const [userRow] = await getDb()`
    SELECT id FROM app_users
    WHERE id = ${userId} AND app_id = ${appId} AND status = 'active'
      AND disabled_at IS NULL AND deleted_at IS NULL
      AND (locked_until IS NULL OR locked_until <= NOW())
    LIMIT 1
  `;
  if (!userRow) {
    return {
      ok: false,
      response: problem(404, "Not Found", "User not found", {
        errors: [{ field: "userId", code: ErrorCodes.APP_USER_NOT_FOUND, message: "User not found" }],
      }),
    };
  }

  const identityId = await findIdentityIdForUserProvider(userId, providerId);
  if (!identityId) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Provider is not linked for this user", {
        errors: [{ field: "providerId", code: ErrorCodes.PROVIDER_NOT_FOUND, message: "Provider is not linked for this user" }],
      }),
    };
  }

  const secrets = await getProviderSecrets(providerId);
  if (!secrets) {
    return {
      ok: false,
      response: problem(404, "Not Found", "Provider not found", {
        errors: [{ field: "providerId", code: ErrorCodes.PROVIDER_NOT_FOUND, message: "Provider not found" }],
      }),
    };
  }

  return { ok: true, identityId, secrets };
}

async function buildTokenResponse(
  identityId: string,
  stored: StoredTokenRow,
  refreshed: boolean,
): Promise<FederationUserTokenResponse> {
  const accessToken = await decryptSecret(stored.access_token_ciphertext);
  return {
    accessToken,
    tokenType: stored.token_type || "Bearer",
    scope: stored.scope,
    expiresAt: stored.expires_at ? new Date(stored.expires_at).toISOString() : null,
    refreshed,
  };
}

export async function getFederationUserToken(options: {
  appId: string;
  userId: string;
  providerId: string;
  forceRefresh?: boolean;
}): Promise<
  | { ok: true; token: FederationUserTokenResponse }
  | { ok: false; response: Response }
> {
  if (!options.appId || !options.userId || !options.providerId) {
    return {
      ok: false,
      response: problem(400, "Validation Error", "Invalid request", {
        errors: [{ field: "_path", code: ErrorCodes.REQUIRED, message: "Missing path parameter" }],
      }),
    };
  }

  const resolved = await resolveUserProvider(options.appId, options.userId, options.providerId);
  if (!resolved.ok) return resolved;

  let stored = await loadStoredToken(resolved.identityId);
  if (!stored) {
    return {
      ok: false,
      response: problem(404, "Not Found", "No provider token stored for this user", {
        errors: [{ field: "providerId", code: ErrorCodes.PROVIDER_NOT_FOUND, message: "No provider token stored for this user" }],
      }),
    };
  }

  const needsRefresh =
    options.forceRefresh || (tokenExpired(stored.expires_at) && Boolean(stored.refresh_token_ciphertext));

  if (needsRefresh) {
    if (!stored.refresh_token_ciphertext) {
      return {
        ok: false,
        response: problem(410, "Gone", "Provider token expired and cannot be refreshed", {
          errors: [{
            field: "providerId",
            code: ErrorCodes.FEDERATION_TOKEN_EXPIRED,
            message: "Ask the user to sign in with this provider again",
          }],
        }),
      };
    }

    const refreshToken = await decryptSecret(stored.refresh_token_ciphertext);
    try {
      const refreshedTokens = await refreshUpstreamToken({
        secrets: resolved.secrets,
        refreshToken,
      });
      await persistRefreshedTokens({ identityId: resolved.identityId, tokens: refreshedTokens });
      stored = (await loadStoredToken(resolved.identityId))!;
      return { ok: true, token: await buildTokenResponse(resolved.identityId, stored, true) };
    } catch {
      return {
        ok: false,
        response: problem(502, "Bad Gateway", "Could not refresh provider token", {
          errors: [{
            field: "providerId",
            code: ErrorCodes.FEDERATION_TOKEN_REFRESH_FAILED,
            message: "Upstream provider rejected the refresh request",
          }],
        }),
      };
    }
  }

  if (tokenExpired(stored.expires_at) && !stored.refresh_token_ciphertext) {
    return {
      ok: false,
      response: problem(410, "Gone", "Provider token expired", {
        errors: [{
          field: "providerId",
          code: ErrorCodes.FEDERATION_TOKEN_EXPIRED,
          message: "Ask the user to sign in with this provider again",
        }],
      }),
    };
  }

  return { ok: true, token: await buildTokenResponse(resolved.identityId, stored, false) };
}

export async function refreshFederationUserToken(options: {
  appId: string;
  userId: string;
  providerId: string;
  actorUserId?: string;
  actorMode: "console" | "bearer";
}): Promise<
  | { ok: true; token: FederationUserTokenResponse }
  | { ok: false; response: Response }
> {
  const result = await getFederationUserToken({ ...options, forceRefresh: true });
  if (result.ok) {
  await writeAuditEvent({
    actorUserId: options.actorUserId || null,
    action: "federation.token_refreshed",
      resourceType: "app_user",
      resourceId: options.userId,
      payload: { appId: options.appId, providerId: options.providerId, actorMode: options.actorMode },
    });
  }
  return result;
}

export async function auditFederationTokenAccess(options: {
  appId: string;
  userId: string;
  providerId: string;
  actorUserId?: string;
  actorMode: "console" | "bearer";
  refreshed: boolean;
}): Promise<void> {
  await writeAuditEvent({
    actorUserId: options.actorUserId || null,
    action: "federation.token_accessed",
    resourceType: "app_user",
    resourceId: options.userId,
    payload: {
      appId: options.appId,
      providerId: options.providerId,
      actorMode: options.actorMode,
      refreshed: options.refreshed,
    },
  });
}
