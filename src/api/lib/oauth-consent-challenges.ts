import type {
  OAuthConsentChallenge,
  OAuthConsentChallengeAuthority,
  OAuthConsentCompletion,
  OAuthConsentCompletionInput,
} from "../../capabilities/authorization-server";
import { writeAuditEvent } from "./audit";
import { sha256Hex } from "./crypto";
import { getDb } from "./db";
import { upsertOAuthUserConsent } from "./oauth-consent";
import { issueAuthorizationCode } from "./oauth";

type ChallengeRow = {
  id: string;
  app_user_id: string;
  app_id: string;
  client_id: string;
  app_credential_id: string;
  redirect_uri: string;
  scope: string;
  oauth_state: string | null;
  code_challenge: string | null;
  code_challenge_method: string | null;
  oidc_nonce: string | null;
  expired: boolean;
  consumed_at: Date | null;
  authority_active: boolean;
};

function nullableEqual(left: string | null, right: string | null): boolean {
  return (left ?? "") === (right ?? "");
}

function matchesChallenge(row: ChallengeRow, input: OAuthConsentCompletionInput): boolean {
  return input.nonce === input.confirmationNonce
    && input.responseType === "code"
    && (input.decision === "approve" || input.decision === "deny")
    && row.app_user_id === input.appUserId
    && row.app_id === input.appId
    && row.client_id === input.clientId
    && row.redirect_uri === input.redirectUri
    && row.scope === input.scope
    && nullableEqual(row.oauth_state, input.state)
    && nullableEqual(row.code_challenge, input.codeChallenge)
    && nullableEqual(row.code_challenge_method, input.codeChallengeMethod)
    && nullableEqual(row.oidc_nonce, input.oidcNonce)
    && row.authority_active;
}

async function auditRejection(
  reason: "missing" | "expired" | "mismatched" | "replayed",
  input: OAuthConsentCompletionInput,
  resourceId?: string,
  tx = getDb(),
): Promise<void> {
  await writeAuditEvent({
    action: "oauth.consent_rejected",
    resourceType: "oauth_consent_challenge",
    resourceId,
    payload: {
      reason,
      appId: input.appId,
      appUserId: input.appUserId,
      clientId: input.clientId,
    },
  }, tx);
}

export function createPostgresOAuthConsentChallengeAuthority(): OAuthConsentChallengeAuthority {
  return {
    async create(challenge: OAuthConsentChallenge): Promise<void> {
      const nonceHash = await sha256Hex(challenge.nonce);
      const created = await getDb()`
        INSERT INTO oauth_consent_challenges (
          purpose,
          nonce_hash,
          app_user_id,
          app_id,
          app_credential_id,
          redirect_uri,
          scope,
          oauth_state,
          code_challenge,
          code_challenge_method,
          oidc_nonce,
          expires_at
        )
        SELECT
          ${challenge.purpose},
          ${nonceHash},
          ${challenge.appUserId},
          ${challenge.appId},
          credentials.id,
          ${challenge.redirectUri},
          ${challenge.scope},
          ${challenge.state},
          ${challenge.codeChallenge},
          ${challenge.codeChallengeMethod},
          ${challenge.oidcNonce},
          clock_timestamp() + (${challenge.lifetimeSeconds} * INTERVAL '1 second')
        FROM app_credentials credentials
        WHERE credentials.client_id = ${challenge.clientId}
          AND credentials.app_id = ${challenge.appId}
          AND credentials.status = 'active'
        RETURNING id
      `;
      if (created.length !== 1) {
        throw new Error("Cannot create an OAuth consent challenge for an inactive client");
      }
    },

    async findContext(nonce: string) {
      const nonceHash = await sha256Hex(nonce);
      const [record] = await getDb()`
        SELECT challenge.app_id
        FROM oauth_consent_challenges challenge
        WHERE challenge.nonce_hash = ${nonceHash}
          AND challenge.purpose = 'oauth_consent'
        LIMIT 1
      `;
      if (!record) return null;
      return { appId: String((record as { app_id: string }).app_id) };
    },

    async complete(input: OAuthConsentCompletionInput): Promise<OAuthConsentCompletion> {
      const nonceHash = await sha256Hex(input.nonce);
      return getDb().begin(async (tx) => {
        const [record] = await tx`
          SELECT
            challenge.id,
            challenge.app_user_id,
            challenge.app_id,
            credentials.client_id,
            challenge.app_credential_id,
            challenge.redirect_uri,
            challenge.scope,
            challenge.oauth_state,
            challenge.code_challenge,
            challenge.code_challenge_method,
            challenge.oidc_nonce,
            challenge.expires_at <= clock_timestamp() AS expired,
            challenge.consumed_at,
            (
              credentials.status = 'active'
              AND application.status = 'active'
              AND identity.status = 'active'
              AND identity.disabled_at IS NULL
              AND identity.deleted_at IS NULL
              AND (identity.locked_until IS NULL OR identity.locked_until <= clock_timestamp())
              AND challenge.redirect_uri = ANY(application.redirect_uris)
              AND NOT EXISTS (
                SELECT 1
                FROM unnest(regexp_split_to_array(challenge.scope, '\\s+')) AS requested(scope_name)
                WHERE requested.scope_name <> ''
                  AND NOT EXISTS (
                    SELECT 1
                    FROM app_scopes allowed
                    WHERE allowed.app_id = challenge.app_id
                      AND allowed.name = requested.scope_name
                  )
              )
            ) AS authority_active
          FROM oauth_consent_challenges challenge
          JOIN app_credentials credentials ON credentials.id = challenge.app_credential_id
          JOIN apps application ON application.id = challenge.app_id
          JOIN app_users identity
            ON identity.id = challenge.app_user_id
            AND identity.app_id = challenge.app_id
          WHERE challenge.nonce_hash = ${nonceHash}
            AND challenge.purpose = 'oauth_consent'
          FOR UPDATE OF challenge, credentials, application, identity
        `;
        if (!record) {
          await auditRejection("missing", input, undefined, tx);
          return { outcome: "missing" };
        }

        const row = record as ChallengeRow;
        if (row.consumed_at) {
          await auditRejection("replayed", input, row.id, tx);
          return { outcome: "replayed" };
        }
        if (row.expired) {
          await tx`
            UPDATE oauth_consent_challenges
            SET consumed_at = NOW(), completion_outcome = 'expired'
            WHERE id = ${row.id}
          `;
          await auditRejection("expired", input, row.id, tx);
          return { outcome: "expired" };
        }
        if (!matchesChallenge(row, input)) {
          await tx`
            UPDATE oauth_consent_challenges
            SET consumed_at = NOW(), completion_outcome = 'mismatched'
            WHERE id = ${row.id}
          `;
          await auditRejection("mismatched", input, row.id, tx);
          return { outcome: "mismatched" };
        }

        if (input.decision === "deny") {
          await tx`
            UPDATE oauth_consent_challenges
            SET consumed_at = NOW(), completion_outcome = 'denied'
            WHERE id = ${row.id}
          `;
          await writeAuditEvent({
            action: "oauth.consent_denied",
            resourceType: "oauth_consent_challenge",
            resourceId: row.id,
            payload: { appId: row.app_id, appUserId: row.app_user_id, clientId: row.client_id },
          }, tx);
          return { outcome: "denied", redirectUri: row.redirect_uri, state: row.oauth_state };
        }

        const code = await issueAuthorizationCode({
          appId: row.app_id,
          appUserId: row.app_user_id,
          appCredentialId: row.app_credential_id,
          redirectUri: row.redirect_uri,
          scope: row.scope,
          codeChallenge: row.code_challenge,
          codeChallengeMethod: row.code_challenge_method,
          nonce: row.oidc_nonce,
        }, tx);
        await upsertOAuthUserConsent({
          appUserId: row.app_user_id,
          appId: row.app_id,
          requestedScope: row.scope,
        }, tx);
        await tx`
          UPDATE oauth_consent_challenges
          SET consumed_at = NOW(), completion_outcome = 'approved'
          WHERE id = ${row.id}
        `;
        await writeAuditEvent({
          action: "oauth.consent_approved",
          resourceType: "oauth_consent_challenge",
          resourceId: row.id,
          payload: { appId: row.app_id, appUserId: row.app_user_id, clientId: row.client_id },
        }, tx);
        return {
          outcome: "approved",
          code,
          redirectUri: row.redirect_uri,
          state: row.oauth_state,
        };
      });
    },
  };
}
