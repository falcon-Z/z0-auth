import type { SQL } from "bun";

import { writeRefreshTokenReuseAuditRecord } from "./audit";
import { randomToken, sha256Hex } from "./crypto";
import { getDb } from "./db";
import { lockResourceAuthority, resolveResourceAuthority } from "./oauth-resources";
import { verifyPassword } from "./password";
import { decryptSecret, encryptSecret } from "./settings-crypto";

const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_RETRY_TTL_MS = 10 * 1000;

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
  browserOrigins: string[];
  purpose: "interactive" | "workload";
  refreshEnabled: boolean;
  effectiveAssurance: "baseline" | "strong";
};

type AuthorizationCodeRow = {
  id: string;
  app_id: string;
  app_user_id: string;
  app_credential_id: string;
  redirect_uri: string;
  scope: string;
  resource_id: string;
  code_challenge: string | null;
  code_challenge_method: string | null;
  oidc_nonce: string | null;
  expires_at: Date;
  used_at: Date | null;
  issued_assurance: "baseline" | "strong";
};

type AuthorizationCodePreview = {
  appUserId: string;
  scope: string;
  nonce: string | null;
};

export type OAuthAccessTokenRecord = {
  clientId: string;
  appId: string;
  appUserId: string | null;
  scope: string;
  expiresAt: Date;
  revokedAt: Date | null;
  appCredentialId: string;
  audience: string;
  grantId: string;
};

type RefreshTokenRow = {
  id: string;
  app_id: string;
  app_user_id: string;
  app_credential_id: string;
  scope: string;
  family_id: string;
  resource_id: string;
  grant_id: string;
  audience: string;
  replaced_by_token_id: string | null;
  revoked_at: Date | null;
  expires_at: Date;
  retry_key_hash: string | null;
  retry_response_ciphertext: string | null;
  retry_expires_at: Date | null;
  compromised_at: Date | null;
  issued_assurance: "baseline" | "strong";
};

type RefreshRotationOutcome = {
  accessToken: string;
  refreshToken: string;
  scope: string;
  appUserId: string;
};

// Management writes lock the parent before its children. Issuance uses the
// same order so containment cannot miss a newly committed refresh replacement.
async function lockClientAuthority(tx: SQL, appId: string, id: string) {
  await lockResourceAuthority(tx);
  await tx`SELECT id FROM apps WHERE id = ${appId} FOR SHARE`;
  await tx`SELECT id FROM oauth_clients WHERE id = ${id} AND app_id = ${appId} FOR SHARE`;
}

export async function findActiveOAuthClient(
  clientId: string,
): Promise<OAuthClient | null> {
  const [row] = await getDb()`
    SELECT
      c.id AS credential_id,
      c.app_id,
      c.client_id,
      c.client_secret_hash,
      c.client_type,
      c.redirect_uris, c.browser_origins, c.purpose, c.refresh_enabled,
      CASE WHEN a.minimum_assurance = 'strong' OR c.assurance_override = 'strong' THEN 'strong' ELSE 'baseline' END AS effective_assurance
    FROM oauth_clients c
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
    browser_origins: string[];
    purpose: "interactive" | "workload";
    refresh_enabled: boolean;
    effective_assurance: "baseline" | "strong";
  };
  return {
    credentialId: String(data.credential_id),
    appId: String(data.app_id),
    clientId: data.client_id,
    clientType: data.client_type,
    clientSecretHash: data.client_secret_hash,
    redirectUris: (data.redirect_uris as string[]) ?? [],
    browserOrigins: data.browser_origins,
    purpose: data.purpose,
    refreshEnabled: data.refresh_enabled,
    effectiveAssurance: data.effective_assurance,
  };
}

export function isAllowedRedirectUri(
  client: OAuthClient,
  redirectUri: string,
): boolean {
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

export async function issueAuthorizationCode(
  input: {
    appId: string;
    appUserId: string;
    appCredentialId: string;
    redirectUri: string;
    scope: string;
    resource: string;
    codeChallenge: string | null;
    codeChallengeMethod: string | null;
    nonce: string | null;
    sessionId?: string;
  },
  tx?: SQL,
): Promise<string> {
  const code = `z0_ac_${randomToken(16)}`;
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);

  const execute = async (db: SQL) => {
    await lockClientAuthority(db, input.appId, input.appCredentialId);
    const [authority] =
      await db`SELECT c.id, c.purpose, c.redirect_uris, a.status AS app_status, c.status,
      (a.minimum_assurance = 'strong' OR c.assurance_override = 'strong') AS requires_strong
      FROM oauth_clients c JOIN apps a ON a.id = c.app_id
      WHERE c.id = ${input.appCredentialId} AND c.app_id = ${input.appId} FOR SHARE OF a, c`;
    if (
      !authority ||
      authority.status !== "active" ||
      authority.app_status !== "active" ||
      authority.purpose !== "interactive" ||
      !authority.redirect_uris.includes(input.redirectUri)
    )
      throw new Error("invalid_authorization_authority");
    const resource = await resolveResourceAuthority(db, input.appCredentialId, input.resource, input.scope);
    if (!resource.ok) throw new Error("invalid_authorization_authority");
    let assurance = "baseline";
    if (input.sessionId) {
      const [session] =
        await db`SELECT s.mfa_authenticated_at FROM app_user_sessions s JOIN app_browser_sessions b ON b.id = s.browser_session_id
        WHERE s.id = ${input.sessionId} AND s.app_user_id = ${input.appUserId} AND s.app_id = ${input.appId}
          AND s.revoked_at IS NULL AND s.expires_at > NOW() AND b.revoked_at IS NULL AND b.expires_at > NOW()
        FOR SHARE OF s, b`;
      if (session?.mfa_authenticated_at) assurance = "strong";
    }
    if (authority.requires_strong && assurance !== "strong")
      throw new Error("insufficient_assurance");
    await db`
    INSERT INTO oauth_authorization_codes (
      code_hash,
      app_id,
      app_user_id,
      app_credential_id,
      redirect_uri,
      scope,
      code_challenge,
      code_challenge_method,
      oidc_nonce,
      expires_at, issued_assurance, resource_id
    )
    VALUES (
      ${codeHash},
      ${input.appId},
      ${input.appUserId},
      ${input.appCredentialId},
      ${input.redirectUri},
      ${resource.scope},
      ${input.codeChallenge},
      ${input.codeChallengeMethod},
      ${input.nonce},
      ${expiresAt}, ${assurance}, ${resource.resourceId}
    )
  `;
  };
  if (tx) await execute(tx);
  else await getDb().begin(execute);
  return code;
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
): Promise<boolean> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
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
  resource?: string;
}): Promise<
  | ({ ok: true } & OAuthTokenSuccess)
  | { ok: false; error: "invalid_grant" | "invalid_request" }
> {
  if (input.client.purpose !== "interactive")
    return { ok: false, error: "invalid_grant" };
  const preview = await previewAuthorizationCodeForExchange(input);
  if (!preview.ok) return preview;
  const codeHash = await sha256Hex(input.code);
  const [row] = await getDb()`
    SELECT id, app_id, app_user_id, app_credential_id, scope, issued_assurance, resource_id
    FROM oauth_authorization_codes
    WHERE code_hash = ${codeHash}
    LIMIT 1
  `;
  if (!row) return { ok: false, error: "invalid_grant" };
  const codeRow = row as Pick<
    AuthorizationCodeRow,
    | "id"
    | "app_id"
    | "app_user_id"
    | "app_credential_id"
    | "scope"
    | "issued_assurance"
    | "resource_id"
  >;

  const accessToken = `z0_at_${randomToken(24)}`;
  const tokenHash = await sha256Hex(accessToken);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshToken = `z0_rt_${randomToken(24)}`;
  const refreshHash = await sha256Hex(refreshToken);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  const familyId = crypto.randomUUID();

  let refreshEnabled = false;
  try {
    refreshEnabled = await getDb().begin(async (tx) => {
      await lockClientAuthority(
        tx,
        input.client.appId,
        input.client.credentialId,
      );
      const [fresh] = await tx`
        SELECT c.id, c.used_at, c.expires_at, ac.refresh_enabled
        FROM oauth_authorization_codes c
        JOIN app_users u ON u.id = c.app_user_id
        JOIN oauth_clients ac ON ac.id = c.app_credential_id
        JOIN apps a ON a.id = c.app_id
        WHERE c.id = ${codeRow.id}
          AND u.status = 'active'
          AND u.disabled_at IS NULL AND u.deleted_at IS NULL
          AND (u.locked_until IS NULL OR u.locked_until <= NOW())
          AND ac.status = 'active' AND ac.purpose = 'interactive'
          AND (c.issued_assurance = 'strong' OR (a.minimum_assurance = 'baseline' AND ac.assurance_override IS DISTINCT FROM 'strong'))
          AND a.status = 'active'
        FOR UPDATE OF c, u
      `;
      if (!fresh) throw new Error("invalid_grant");
      const freshRow = fresh as {
        id: string;
        used_at: Date | null;
        expires_at: Date;
      };
      if (
        freshRow.used_at ||
        new Date(freshRow.expires_at).getTime() <= Date.now()
      ) {
        throw new Error("invalid_grant");
      }

      const [resourceRow] = await tx`SELECT audience FROM oauth_resources WHERE id = ${codeRow.resource_id}`;
      const authority = await resolveResourceAuthority(tx, input.client.credentialId, resourceRow?.audience, codeRow.scope);
      if (!authority.ok || (input.resource !== undefined && input.resource !== authority.audience)) throw new Error("invalid_grant");
      const [grant] = await tx`INSERT INTO oauth_grants(app_id, client_id, app_user_id, resource_id, scope)
        VALUES (${codeRow.app_id}, ${codeRow.app_credential_id}, ${codeRow.app_user_id}, ${codeRow.resource_id}, ${codeRow.scope}) RETURNING id`;
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
          refresh_family_id,
          expires_at, resource_id, grant_id
        )
        VALUES (
          ${tokenHash},
          ${codeRow.app_id},
          ${codeRow.app_user_id},
          ${codeRow.app_credential_id},
          ${codeRow.scope},
          ${familyId},
          ${expiresAt}, ${codeRow.resource_id}, ${grant.id}
        )
      `;

      if (fresh.refresh_enabled)
        await tx`
        INSERT INTO oauth_refresh_tokens (
          token_hash,
          app_id,
          app_user_id,
          app_credential_id,
          scope,
          family_id,
          expires_at, issued_assurance, resource_id, grant_id
        )
        VALUES (
          ${refreshHash},
          ${codeRow.app_id},
          ${codeRow.app_user_id},
          ${codeRow.app_credential_id},
          ${codeRow.scope},
          ${familyId},
          ${refreshExpiresAt}, ${codeRow.issued_assurance}, ${codeRow.resource_id}, ${grant.id}
        )
      `;
      return Boolean(fresh.refresh_enabled);
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
    refreshToken: refreshEnabled ? refreshToken : undefined,
    appUserId: String(codeRow.app_user_id),
  };
}

export async function previewAuthorizationCodeForExchange(input: {
  code: string;
  client: OAuthClient;
  redirectUri: string;
  codeVerifier?: string;
  resource?: string;
}): Promise<
  | { ok: true; preview: AuthorizationCodePreview }
  | { ok: false; error: "invalid_grant" }
> {
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
      c.oidc_nonce, c.resource_id,
      c.expires_at,
      c.used_at
    FROM oauth_authorization_codes c
    JOIN app_users u ON u.id = c.app_user_id
    JOIN oauth_clients ac ON ac.id = c.app_credential_id
    JOIN apps a ON a.id = c.app_id
    WHERE c.code_hash = ${codeHash}
      AND u.status = 'active'
      AND u.disabled_at IS NULL AND u.deleted_at IS NULL
      AND (u.locked_until IS NULL OR u.locked_until <= NOW())
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
  const [resource] = await getDb()`SELECT audience FROM oauth_resources WHERE id = ${codeRow.resource_id}`;
  if (!resource || (input.resource !== undefined && input.resource !== resource.audience)) return { ok: false, error: "invalid_grant" };
  if (codeRow.code_challenge) {
    if (codeRow.code_challenge_method !== "S256")
      return { ok: false, error: "invalid_grant" };
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
      nonce: codeRow.oidc_nonce ?? null,
    },
  };
}

async function revokeRefreshTokenFamily(
  tx: ReturnType<typeof getDb>,
  familyId: string,
  compromised = false,
): Promise<void> {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}::text, 0))`;
  await tx`UPDATE oauth_grants SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id IN (SELECT grant_id FROM oauth_refresh_tokens WHERE family_id = ${familyId})`;
  await tx`
    UPDATE oauth_refresh_tokens
    SET revoked_at = COALESCE(revoked_at, NOW()),
        retry_key_hash = NULL,
        retry_response_ciphertext = NULL,
        retry_expires_at = NULL,
        compromised_at = CASE
          WHEN ${compromised} THEN COALESCE(compromised_at, NOW())
          ELSE compromised_at
        END
    WHERE family_id = ${familyId}
  `;
  await tx`
    UPDATE oauth_access_tokens
    SET revoked_at = NOW()
    WHERE refresh_family_id = ${familyId}
      AND revoked_at IS NULL
  `;
}

export type RefreshTokenExchangeInput = {
  refreshToken: string;
  client: OAuthClient;
  retryKey?: string;
  resource?: string;
  scope?: string;
};

export type RefreshTokenExchangeResult =
  ({ ok: true } & OAuthTokenSuccess) | { ok: false; error: "invalid_grant" | "invalid_scope" };

async function exchangeRefreshTokenWithDatabase(
  database: SQL,
  input: RefreshTokenExchangeInput,
): Promise<RefreshTokenExchangeResult> {
  const tokenHash = await sha256Hex(input.refreshToken);
  const retryKeyHash = input.retryKey ? await sha256Hex(`${input.retryKey}\0${input.scope === undefined ? "grant" : [...parseScopeSet(input.scope)].join(" ")}`) : null;
  const accessToken = `z0_at_${randomToken(24)}`;
  const accessHash = await sha256Hex(accessToken);
  const accessExpiresAt = new Date(
    Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
  );
  const newRefreshToken = `z0_rt_${randomToken(24)}`;
  const newRefreshHash = await sha256Hex(newRefreshToken);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const result = await database.begin(async (tx) => {
    await lockClientAuthority(
      tx,
      input.client.appId,
      input.client.credentialId,
    );
    // Recovery/lifecycle transitions lock the Account before revoking families.
    // Inserts also take exclusive identity locks through the membership trigger.
    // Acquire them before the family lock without a later shared-lock upgrade.
    const [familyRow] = await tx`
        SELECT r.family_id
        FROM oauth_refresh_tokens r
        JOIN app_users u ON u.id = r.app_user_id AND u.app_id = r.app_id
        WHERE r.token_hash = ${tokenHash}
          AND r.app_credential_id = ${input.client.credentialId}
        LIMIT 1
        FOR UPDATE OF u
      `;
    if (!familyRow) return { ok: false as const };
    const familyId = String((familyRow as { family_id: string }).family_id);
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}::text, 0))`;

    const [row] = await tx`
        SELECT
          r.id,
          r.app_id,
          r.app_user_id,
          r.app_credential_id,
          g.scope, r.resource_id, r.grant_id, resource.audience,
          r.family_id,
          r.replaced_by_token_id,
          r.revoked_at,
          r.expires_at,
          r.retry_key_hash,
          r.retry_response_ciphertext,
          r.retry_expires_at,
          r.compromised_at, r.issued_assurance
        FROM oauth_refresh_tokens r
        JOIN oauth_grants g ON g.id = r.grant_id AND g.revoked_at IS NULL
        JOIN oauth_resources resource ON resource.id = r.resource_id AND resource.status = 'active'
        JOIN app_users u ON u.id = r.app_user_id
        JOIN apps a ON a.id = r.app_id
        JOIN oauth_clients ac ON ac.id = r.app_credential_id
        WHERE r.token_hash = ${tokenHash}
          AND u.status = 'active'
          AND u.disabled_at IS NULL AND u.deleted_at IS NULL
          AND (u.locked_until IS NULL OR u.locked_until <= NOW())
          AND a.status = 'active'
          AND ac.status = 'active' AND ac.refresh_enabled AND ac.purpose = 'interactive'
          AND (r.issued_assurance = 'strong' OR (a.minimum_assurance = 'baseline' AND ac.assurance_override IS DISTINCT FROM 'strong'))
        FOR UPDATE OF r
      `;
    if (!row) return { ok: false as const };
    const refresh = row as RefreshTokenRow;

    if (input.resource !== undefined && input.resource !== refresh.audience) return { ok: false as const };

    if (String(refresh.app_credential_id) !== input.client.credentialId) {
      return { ok: false as const };
    }

    const grantScopes = parseScopeSet(refresh.scope);
    const requestedScopes = input.scope === undefined ? grantScopes : parseScopeSet(input.scope);
    if ([...requestedScopes].some(scope => !grantScopes.has(scope))) return { ok: false as const, error: "invalid_scope" as const };
    const issuanceScope = [...requestedScopes].join(" ");

    if (refresh.replaced_by_token_id && refresh.revoked_at) {
      if (refresh.compromised_at) return { ok: false as const };
      const retryIsValid = Boolean(
        retryKeyHash &&
        refresh.retry_key_hash === retryKeyHash &&
        refresh.retry_response_ciphertext &&
        refresh.retry_expires_at &&
        new Date(refresh.retry_expires_at).getTime() > Date.now(),
      );
      if (retryIsValid) {
        const outcome = JSON.parse(
          await decryptSecret(refresh.retry_response_ciphertext!),
        ) as RefreshRotationOutcome;
        return { ok: true as const, outcome };
      }

      await revokeRefreshTokenFamily(tx, refresh.family_id, true);
      await writeRefreshTokenReuseAuditRecord(
        {
          familyId: refresh.family_id,
          appId: String(refresh.app_id),
          appUserId: String(refresh.app_user_id),
        },
        tx,
      );
      return { ok: false as const };
    }

    if (refresh.revoked_at) return { ok: false as const };

    if (new Date(refresh.expires_at).getTime() <= Date.now()) {
      return { ok: false as const };
    }

    const authority = await resolveResourceAuthority(tx, input.client.credentialId, refresh.audience, refresh.scope);
    if (!authority.ok) {
      await revokeRefreshTokenFamily(tx, refresh.family_id);
      return { ok: false as const };
    }

    const [replacement] = await tx`
        INSERT INTO oauth_refresh_tokens (
          token_hash,
          app_id,
          app_user_id,
          app_credential_id,
          scope,
          family_id,
          expires_at, issued_assurance, resource_id, grant_id
        )
        VALUES (
          ${newRefreshHash},
          ${refresh.app_id},
          ${refresh.app_user_id},
          ${refresh.app_credential_id},
          ${refresh.scope},
          ${refresh.family_id},
          ${refreshExpiresAt}, ${refresh.issued_assurance}, ${refresh.resource_id}, ${refresh.grant_id}
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
          refresh_family_id,
          expires_at, resource_id, grant_id
        )
        VALUES (
          ${accessHash},
          ${refresh.app_id},
          ${refresh.app_user_id},
          ${refresh.app_credential_id},
          ${issuanceScope},
          ${refresh.family_id},
          ${accessExpiresAt}, ${refresh.resource_id}, ${refresh.grant_id}
        )
      `;

    const outcome: RefreshRotationOutcome = {
      accessToken,
      refreshToken: newRefreshToken,
      scope: issuanceScope,
      appUserId: String(refresh.app_user_id),
    };
    const retryResponseCiphertext = input.retryKey
      ? await encryptSecret(JSON.stringify(outcome))
      : null;
    const retryExpiresAt = input.retryKey
      ? new Date(Date.now() + REFRESH_RETRY_TTL_MS)
      : null;

    await tx`
        UPDATE oauth_refresh_tokens
        SET retry_key_hash = ${retryKeyHash},
            retry_response_ciphertext = ${retryResponseCiphertext},
            retry_expires_at = ${retryExpiresAt}
        WHERE id = ${refresh.id}
      `;

    return {
      ok: true as const,
      outcome,
    };
  });

  if (!result.ok) {
    return { ok: false, error: "error" in result ? result.error! : "invalid_grant" };
  }

  return {
    ok: true,
    accessToken: result.outcome.accessToken,
    tokenType: "Bearer",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    scope: result.outcome.scope,
    refreshToken: result.outcome.refreshToken,
    appUserId: result.outcome.appUserId,
  };
}

export function createRefreshTokenExchange(
  database: SQL,
): (input: RefreshTokenExchangeInput) => Promise<RefreshTokenExchangeResult> {
  return (input) => exchangeRefreshTokenWithDatabase(database, input);
}

export async function exchangeRefreshToken(
  input: RefreshTokenExchangeInput,
): Promise<RefreshTokenExchangeResult> {
  return exchangeRefreshTokenWithDatabase(getDb(), input);
}

export async function issueClientCredentialsToken(input: {
  client: OAuthClient;
  scope: string;
  resource?: string;
}): Promise<({ ok: true } & OAuthTokenSuccess) | { ok: false; error: "invalid_scope" | "invalid_target" | "unauthorized_client" }> {
  if (input.client.clientType !== "confidential" || input.client.purpose !== "workload") return { ok: false, error: "unauthorized_client" };
  return getDb().begin(async tx => {
    await lockClientAuthority(tx, input.client.appId, input.client.credentialId);
    const [client] = await tx`SELECT c.id FROM oauth_clients c JOIN apps a ON a.id = c.app_id
      WHERE c.id = ${input.client.credentialId} AND c.status = 'active' AND a.status = 'active' AND c.purpose = 'workload' AND c.client_type = 'confidential'`;
    if (!client) return { ok: false as const, error: "unauthorized_client" as const };
    const authority = await resolveResourceAuthority(tx, input.client.credentialId, input.resource, input.scope);
    if (!authority.ok) return authority;
    const [grant] = await tx`INSERT INTO oauth_grants(app_id, client_id, resource_id, scope)
      VALUES (${input.client.appId}, ${input.client.credentialId}, ${authority.resourceId}, ${authority.scope}) RETURNING id`;
    const accessToken = `z0_at_${randomToken(24)}`;
    const tokenHash = await sha256Hex(accessToken);
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
    await tx`INSERT INTO oauth_access_tokens(token_hash, app_id, app_user_id, app_credential_id, scope, expires_at, resource_id, grant_id)
      VALUES (${tokenHash}, ${input.client.appId}, NULL, ${input.client.credentialId}, ${authority.scope}, ${expiresAt}, ${authority.resourceId}, ${grant.id})`;
    return { ok: true as const, accessToken, tokenType: "Bearer" as const, expiresIn: ACCESS_TOKEN_TTL_SECONDS, scope: authority.scope };
  });
}

export async function revokeOAuthToken(input: {
  token: string;
  client: OAuthClient;
}): Promise<void> {
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
      await revokeRefreshTokenFamily(
        tx,
        String((refreshRow as { family_id: string }).family_id),
      );
    }
  });
}

async function revokeAllOAuthTokensForAppUserInTransaction(
  tx: SQL,
  appUserId: string,
): Promise<void> {
  const familyRows = await tx`
    SELECT DISTINCT family_id
    FROM oauth_refresh_tokens
    WHERE app_user_id = ${appUserId}
    ORDER BY family_id
  `;
  for (const row of familyRows) {
    const familyId = String((row as { family_id: string }).family_id);
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}::text, 0))`;
  }
  await tx`UPDATE oauth_grants SET revoked_at = COALESCE(revoked_at, NOW()) WHERE app_user_id = ${appUserId}`;
  await tx`
    UPDATE oauth_access_tokens
    SET revoked_at = NOW()
    WHERE app_user_id = ${appUserId}
      AND revoked_at IS NULL
  `;
  await tx`
    UPDATE oauth_refresh_tokens
    SET revoked_at = COALESCE(revoked_at, NOW()),
        retry_key_hash = NULL,
        retry_response_ciphertext = NULL,
        retry_expires_at = NULL
    WHERE app_user_id = ${appUserId}
  `;
}

export async function revokeAllOAuthTokensForAppUser(
  appUserId: string,
  tx?: SQL,
): Promise<void> {
  if (tx) {
    await revokeAllOAuthTokensForAppUserInTransaction(tx, appUserId);
    return;
  }
  await getDb().begin(async (transaction) => {
    await revokeAllOAuthTokensForAppUserInTransaction(transaction, appUserId);
  });
}

export async function revokePendingAuthorizationCodesForAppUser(
  appUserId: string,
): Promise<void> {
  await getDb()`
    UPDATE oauth_authorization_codes
    SET used_at = NOW()
    WHERE app_user_id = ${appUserId}
      AND used_at IS NULL
      AND expires_at > NOW()
  `;
}

export async function findOAuthAccessToken(
  token: string,
): Promise<OAuthAccessTokenRecord | null> {
  const tokenHash = await sha256Hex(token);
  const [row] = await getDb()`
    SELECT
      t.app_id,
      t.app_user_id,
      t.app_credential_id,
      ac.client_id,
      t.scope,
      t.expires_at,
      t.revoked_at, resource.audience, t.grant_id
    FROM oauth_access_tokens t
    JOIN oauth_resources resource ON resource.id = t.resource_id
    JOIN apps a ON a.id = t.app_id
    JOIN oauth_clients ac ON ac.id = t.app_credential_id
    LEFT JOIN app_users u ON u.id = t.app_user_id AND u.app_id = t.app_id
    WHERE t.token_hash = ${tokenHash}
      AND a.status = 'active'
      AND ac.status = 'active'
      AND (
        t.app_user_id IS NULL OR (
          u.status = 'active' AND u.disabled_at IS NULL AND u.deleted_at IS NULL
          AND (u.locked_until IS NULL OR u.locked_until <= NOW())
        )
      )
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
    clientId: String(row.client_id),
    scope: data.scope ?? "",
    expiresAt: data.expires_at,
    revokedAt: data.revoked_at,
    audience: String(row.audience),
    grantId: String(row.grant_id),
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

export async function sessionMeetsClientAssurance(
  client: OAuthClient,
  sessionId: string,
): Promise<boolean> {
  if (client.effectiveAssurance === "baseline") return true;
  const [row] =
    await getDb()`SELECT s.id FROM app_user_sessions s JOIN app_browser_sessions b ON b.id = s.browser_session_id
    WHERE s.id = ${sessionId} AND s.app_id = ${client.appId} AND s.mfa_authenticated_at IS NOT NULL
      AND s.revoked_at IS NULL AND s.expires_at > NOW() AND b.revoked_at IS NULL AND b.expires_at > NOW()`;
  return Boolean(row);
}
