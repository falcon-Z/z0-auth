import { randomToken, sha256Hex } from "./crypto";
import { getDb } from "./db";
import { verifyPassword } from "./password";

const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type OAuthTokenSuccess = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  scope: string;
  refreshToken?: string;
  appUserId?: string;
};

export type OAuthClient = {
  credentialId: string;
  appId: string;
  clientId: string;
  clientType: "public" | "confidential";
  clientSecretHash: string | null;
  redirectUris: string[];
};

type AuthorizationCodeRow = {
  id: string;
  app_id: string;
  app_user_id: string;
  app_credential_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string | null;
  code_challenge_method: string | null;
  expires_at: Date;
  used_at: Date | null;
};

type AuthorizationCodePreview = {
  appUserId: string;
  scope: string;
};

export type OAuthAccessTokenRecord = {
  appId: string;
  appUserId: string | null;
  scope: string;
  expiresAt: Date;
  revokedAt: Date | null;
  appCredentialId: string;
};

type RefreshTokenRow = {
  id: string;
  app_id: string;
  app_user_id: string;
  app_credential_id: string;
  scope: string;
  family_id: string;
  replaced_by_token_id: string | null;
  revoked_at: Date | null;
  expires_at: Date;
};

export async function findActiveOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const [row] = await getDb()`
    SELECT
      c.id AS credential_id,
      c.app_id,
      c.client_id,
      c.client_secret_hash,
      a.client_type,
      a.redirect_uris
    FROM app_credentials c
    JOIN apps a ON a.id = c.app_id
    WHERE c.client_id = ${clientId}
      AND c.status = 'active'
      AND a.status = 'active'
    LIMIT 1
  `;

  if (!row) return null;
  const data = row as {
    credential_id: string;
    app_id: string;
    client_id: string;
    client_secret_hash: string | null;
    client_type: "public" | "confidential";
    redirect_uris: string[];
  };
  return {
    credentialId: String(data.credential_id),
    appId: String(data.app_id),
    clientId: data.client_id,
    clientType: data.client_type,
    clientSecretHash: data.client_secret_hash,
    redirectUris: (data.redirect_uris as string[]) ?? [],
  };
}

export function isAllowedRedirectUri(client: OAuthClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

export async function verifyOAuthClientSecret(
  client: OAuthClient,
  providedSecret: string | undefined,
): Promise<boolean> {
  if (client.clientType === "public") return true;
  if (!providedSecret || !client.clientSecretHash) return false;
  return verifyPassword(providedSecret, client.clientSecretHash);
}

export async function validateRequestedScopes(
  appId: string,
  requestedScope: string,
): Promise<{ ok: true; normalizedScope: string } | { ok: false }> {
  const normalizedScope = requestedScope.trim().replace(/\s+/g, " ");
  if (!normalizedScope) return { ok: true, normalizedScope: "" };

  const requested = normalizedScope
    .split(" ")
    .map((value) => value.trim())
    .filter(Boolean);
  if (requested.length === 0) return { ok: true, normalizedScope: "" };

  const rows = await getDb()`
    SELECT name
    FROM app_scopes
    WHERE app_id = ${appId}
  `;
  const allowed = new Set((rows as { name: string }[]).map((row) => row.name));
  for (const scope of requested) {
    if (!allowed.has(scope)) return { ok: false };
  }
  return { ok: true, normalizedScope: requested.join(" ") };
}

export async function issueAuthorizationCode(input: {
  appId: string;
  appUserId: string;
  appCredentialId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}): Promise<string> {
  const code = `z0_ac_${randomToken(16)}`;
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);

  await getDb()`
    INSERT INTO oauth_authorization_codes (
      code_hash,
      app_id,
      app_user_id,
      app_credential_id,
      redirect_uri,
      scope,
      code_challenge,
      code_challenge_method,
      expires_at
    )
    VALUES (
      ${codeHash},
      ${input.appId},
      ${input.appUserId},
      ${input.appCredentialId},
      ${input.redirectUri},
      ${input.scope},
      ${input.codeChallenge},
      ${input.codeChallengeMethod},
      ${expiresAt}
    )
  `;

  return code;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function verifyPkce(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return toBase64Url(digest) === codeChallenge;
}

function isValidPkceCodeVerifier(value: string): boolean {
  if (value.length < 43 || value.length > 128) return false;
  return /^[A-Za-z0-9\-._~]+$/.test(value);
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  client: OAuthClient;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<{ ok: true } & OAuthTokenSuccess | { ok: false; error: "invalid_grant" | "invalid_request" }> {
  const preview = await previewAuthorizationCodeForExchange(input);
  if (!preview.ok) return preview;
  const codeHash = await sha256Hex(input.code);
  const [row] = await getDb()`
    SELECT id, app_id, app_user_id, app_credential_id, scope
    FROM oauth_authorization_codes
    WHERE code_hash = ${codeHash}
    LIMIT 1
  `;
  if (!row) return { ok: false, error: "invalid_grant" };
  const codeRow = row as Pick<AuthorizationCodeRow, "id" | "app_id" | "app_user_id" | "app_credential_id" | "scope">;

  const accessToken = `z0_at_${randomToken(24)}`;
  const tokenHash = await sha256Hex(accessToken);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshToken = `z0_rt_${randomToken(24)}`;
  const refreshHash = await sha256Hex(refreshToken);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  const familyId = crypto.randomUUID();

  try {
    await getDb().begin(async (tx) => {
      const [fresh] = await tx`
        SELECT c.id, c.used_at, c.expires_at
        FROM oauth_authorization_codes c
        JOIN app_users u ON u.id = c.app_user_id
        JOIN app_credentials ac ON ac.id = c.app_credential_id
        JOIN apps a ON a.id = c.app_id
        WHERE c.id = ${codeRow.id}
          AND u.status = 'active'
          AND ac.status = 'active'
          AND a.status = 'active'
        FOR UPDATE
      `;
      if (!fresh) throw new Error("invalid_grant");
      const freshRow = fresh as { id: string; used_at: Date | null; expires_at: Date };
      if (freshRow.used_at || new Date(freshRow.expires_at).getTime() <= Date.now()) {
        throw new Error("invalid_grant");
      }

      await tx`
        UPDATE oauth_authorization_codes
        SET used_at = NOW()
        WHERE id = ${codeRow.id}
      `;

      await tx`
        INSERT INTO oauth_access_tokens (
          token_hash,
          app_id,
          app_user_id,
          app_credential_id,
          scope,
          expires_at
        )
        VALUES (
          ${tokenHash},
          ${codeRow.app_id},
          ${codeRow.app_user_id},
          ${codeRow.app_credential_id},
          ${codeRow.scope},
          ${expiresAt}
        )
      `;

      await tx`
        INSERT INTO oauth_refresh_tokens (
          token_hash,
          app_id,
          app_user_id,
          app_credential_id,
          scope,
          family_id,
          expires_at
        )
        VALUES (
          ${refreshHash},
          ${codeRow.app_id},
          ${codeRow.app_user_id},
          ${codeRow.app_credential_id},
          ${codeRow.scope},
          ${familyId},
          ${refreshExpiresAt}
        )
      `;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_grant") {
      return { ok: false, error: "invalid_grant" };
    }
    throw error;
  }

  return {
    ok: true,
    accessToken,
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    scope: codeRow.scope ?? "",
    refreshToken,
    appUserId: String(codeRow.app_user_id),
  };
}

export async function previewAuthorizationCodeForExchange(input: {
  code: string;
  client: OAuthClient;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<{ ok: true; preview: AuthorizationCodePreview } | { ok: false; error: "invalid_grant" }> {
  const codeHash = await sha256Hex(input.code);
  const [row] = await getDb()`
    SELECT
      c.id,
      c.app_user_id,
      c.app_credential_id,
      c.redirect_uri,
      c.scope,
      c.code_challenge,
      c.code_challenge_method,
      c.expires_at,
      c.used_at
    FROM oauth_authorization_codes c
    JOIN app_users u ON u.id = c.app_user_id
    JOIN app_credentials ac ON ac.id = c.app_credential_id
    JOIN apps a ON a.id = c.app_id
    WHERE c.code_hash = ${codeHash}
      AND u.status = 'active'
      AND ac.status = 'active'
      AND a.status = 'active'
    LIMIT 1
  `;
  if (!row) return { ok: false, error: "invalid_grant" };
  const codeRow = row as AuthorizationCodeRow;
  if (codeRow.used_at || new Date(codeRow.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "invalid_grant" };
  }
  if (String(codeRow.app_credential_id) !== input.client.credentialId) {
    return { ok: false, error: "invalid_grant" };
  }
  if (codeRow.redirect_uri !== input.redirectUri) {
    return { ok: false, error: "invalid_grant" };
  }
  if (codeRow.code_challenge) {
    if (codeRow.code_challenge_method !== "S256") return { ok: false, error: "invalid_grant" };
    if (!input.codeVerifier || !isValidPkceCodeVerifier(input.codeVerifier)) {
      return { ok: false, error: "invalid_grant" };
    }
    const pkceOk = await verifyPkce(input.codeVerifier, codeRow.code_challenge);
    if (!pkceOk) return { ok: false, error: "invalid_grant" };
  } else if (input.client.clientType === "public") {
    return { ok: false, error: "invalid_grant" };
  }
  return {
    ok: true,
    preview: {
      appUserId: String(codeRow.app_user_id),
      scope: codeRow.scope ?? "",
    },
  };
}

async function revokeRefreshTokenFamily(tx: ReturnType<typeof getDb>, familyId: string): Promise<void> {
  await tx`
    UPDATE oauth_refresh_tokens
    SET revoked_at = NOW()
    WHERE family_id = ${familyId}
      AND revoked_at IS NULL
  `;
}

export async function exchangeRefreshToken(input: {
  refreshToken: string;
  client: OAuthClient;
}): Promise<{ ok: true } & OAuthTokenSuccess | { ok: false; error: "invalid_grant" }> {
  const tokenHash = await sha256Hex(input.refreshToken);
  const accessToken = `z0_at_${randomToken(24)}`;
  const accessHash = await sha256Hex(accessToken);
  const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const newRefreshToken = `z0_rt_${randomToken(24)}`;
  const newRefreshHash = await sha256Hex(newRefreshToken);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  try {
    const result = await getDb().begin(async (tx) => {
      const [row] = await tx`
        SELECT
          r.id,
          r.app_id,
          r.app_user_id,
          r.app_credential_id,
          r.scope,
          r.family_id,
          r.replaced_by_token_id,
          r.revoked_at,
          r.expires_at
        FROM oauth_refresh_tokens r
        JOIN app_users u ON u.id = r.app_user_id
        JOIN apps a ON a.id = r.app_id
        JOIN app_credentials ac ON ac.id = r.app_credential_id
        WHERE r.token_hash = ${tokenHash}
          AND u.status = 'active'
          AND a.status = 'active'
          AND ac.status = 'active'
        FOR UPDATE
      `;
      if (!row) throw new Error("invalid_grant");
      const refresh = row as RefreshTokenRow;

      if (String(refresh.app_credential_id) !== input.client.credentialId) {
        throw new Error("invalid_grant");
      }

      if (refresh.replaced_by_token_id || refresh.revoked_at) {
        await revokeRefreshTokenFamily(tx, refresh.family_id);
        throw new Error("invalid_grant");
      }

      if (new Date(refresh.expires_at).getTime() <= Date.now()) {
        throw new Error("invalid_grant");
      }

      const [replacement] = await tx`
        INSERT INTO oauth_refresh_tokens (
          token_hash,
          app_id,
          app_user_id,
          app_credential_id,
          scope,
          family_id,
          expires_at
        )
        VALUES (
          ${newRefreshHash},
          ${refresh.app_id},
          ${refresh.app_user_id},
          ${refresh.app_credential_id},
          ${refresh.scope},
          ${refresh.family_id},
          ${refreshExpiresAt}
        )
        RETURNING id
      `;
      const replacementId = (replacement as { id: string }).id;

      await tx`
        UPDATE oauth_refresh_tokens
        SET replaced_by_token_id = ${replacementId}, revoked_at = NOW()
        WHERE id = ${refresh.id}
      `;

      await tx`
        INSERT INTO oauth_access_tokens (
          token_hash,
          app_id,
          app_user_id,
          app_credential_id,
          scope,
          expires_at
        )
        VALUES (
          ${accessHash},
          ${refresh.app_id},
          ${refresh.app_user_id},
          ${refresh.app_credential_id},
          ${refresh.scope},
          ${accessExpiresAt}
        )
      `;

      return {
        scope: refresh.scope ?? "",
        appUserId: String(refresh.app_user_id),
      };
    });

    return {
      ok: true,
      accessToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      scope: result.scope,
      refreshToken: newRefreshToken,
      appUserId: result.appUserId,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_grant") {
      return { ok: false, error: "invalid_grant" };
    }
    throw error;
  }
}

export async function issueClientCredentialsToken(input: {
  client: OAuthClient;
  scope: string;
}): Promise<
  | ({ ok: true } & OAuthTokenSuccess)
  | { ok: false; error: "invalid_scope" | "unauthorized_client" }
> {
  if (input.client.clientType !== "confidential") {
    return { ok: false, error: "unauthorized_client" };
  }

  const scopeResult = await validateRequestedScopes(input.client.appId, input.scope);
  if (!scopeResult.ok) return { ok: false, error: "invalid_scope" };

  const accessToken = `z0_at_${randomToken(24)}`;
  const tokenHash = await sha256Hex(accessToken);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);

  await getDb()`
    INSERT INTO oauth_access_tokens (
      token_hash,
      app_id,
      app_user_id,
      app_credential_id,
      scope,
      expires_at
    )
    VALUES (
      ${tokenHash},
      ${input.client.appId},
      NULL,
      ${input.client.credentialId},
      ${scopeResult.normalizedScope},
      ${expiresAt}
    )
  `;

  return {
    ok: true,
    accessToken,
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    scope: scopeResult.normalizedScope,
  };
}

export async function revokeOAuthToken(input: { token: string; client: OAuthClient }): Promise<void> {
  const tokenHash = await sha256Hex(input.token);
  await getDb().begin(async (tx) => {
    await tx`
      UPDATE oauth_access_tokens
      SET revoked_at = NOW()
      WHERE token_hash = ${tokenHash}
        AND app_credential_id = ${input.client.credentialId}
        AND revoked_at IS NULL
    `;

    const [refreshRow] = await tx`
      SELECT family_id
      FROM oauth_refresh_tokens
      WHERE token_hash = ${tokenHash}
        AND app_credential_id = ${input.client.credentialId}
      LIMIT 1
    `;
    if (refreshRow) {
      await revokeRefreshTokenFamily(tx, String((refreshRow as { family_id: string }).family_id));
    }
  });
}

export async function revokeAllOAuthTokensForAppUser(appUserId: string): Promise<void> {
  await getDb().begin(async (tx) => {
    await tx`
      UPDATE oauth_access_tokens
      SET revoked_at = NOW()
      WHERE app_user_id = ${appUserId}
        AND revoked_at IS NULL
    `;
    await tx`
      UPDATE oauth_refresh_tokens
      SET revoked_at = NOW()
      WHERE app_user_id = ${appUserId}
        AND revoked_at IS NULL
    `;
  });
}

export async function revokePendingAuthorizationCodesForAppUser(appUserId: string): Promise<void> {
  await getDb()`
    UPDATE oauth_authorization_codes
    SET used_at = NOW()
    WHERE app_user_id = ${appUserId}
      AND used_at IS NULL
      AND expires_at > NOW()
  `;
}

export async function findOAuthAccessToken(token: string): Promise<OAuthAccessTokenRecord | null> {
  const tokenHash = await sha256Hex(token);
  const [row] = await getDb()`
    SELECT
      t.app_id,
      t.app_user_id,
      t.app_credential_id,
      t.scope,
      t.expires_at,
      t.revoked_at
    FROM oauth_access_tokens t
    JOIN apps a ON a.id = t.app_id
    JOIN app_credentials ac ON ac.id = t.app_credential_id
    WHERE t.token_hash = ${tokenHash}
      AND a.status = 'active'
      AND ac.status = 'active'
    LIMIT 1
  `;
  if (!row) return null;
  const data = row as {
    app_id: string;
    app_user_id: string | null;
    app_credential_id: string;
    scope: string;
    expires_at: Date;
    revoked_at: Date | null;
  };
  return {
    appId: data.app_id,
    appUserId: data.app_user_id ? String(data.app_user_id) : null,
    appCredentialId: data.app_credential_id,
    scope: data.scope ?? "",
    expiresAt: data.expires_at,
    revokedAt: data.revoked_at,
  };
}

export function parseScopeSet(scope: string): Set<string> {
  return new Set(
    scope
      .trim()
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean),
  );
}
